import { Injectable } from '@nestjs/common';
import { AuditAction, LeaseStatus, Prisma } from 'generated/prisma/client';
import { ApiException } from 'src/global/error/apiError';
import { PrismaService } from 'src/global/prisma/prisma.service';
import { monthRange } from '../billing/calendar';
import { PriceTable, priceTable } from '../billing/packages';
import {
  BillingItem,
  buildStatement,
  PriceLookup,
  reais,
  Statement,
  StatementDto,
  statementToApi,
  unitCode,
} from '../billing/statement';
import { MAX_SIMULATION_DAYS } from 'src/global/validators/dateRange.validators';
import { SimulationDto } from '../dto/simulation.dto';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** O contrato como a cobranca o le: itens, obra e cliente. */
const CONTRACT_INCLUDE = {
  leaseItems: true,
  lessee: { include: { client: true } },
} satisfies Prisma.ELeaseInclude;

export type BillingContractRecord = Prisma.ELeaseGetPayload<{
  include: typeof CONTRACT_INCLUDE;
}>;

/** Transacao ou cliente normal: a conta roda nos dois. */
type Db = Prisma.TransactionClient;

/**
 * A cobranca dos contratos: extrato de um contrato, fechamento do mes e
 * simulacao da calculadora. A conta em si mora em `billing/`, sem banco; aqui
 * so se le o que ela precisa, inclusive a tabela de precos em vigor em cada
 * data, do historico que o gatilho `equipment_price_history` escreve.
 */
@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService) {}

  /** A tabela em vigor por data. Equipamento sem historico usa a do item. */
  async priceLookup(
    equipmentIds: string[],
    fallback: Map<string, PriceTable>,
    db: Db = this.prisma,
  ): Promise<PriceLookup> {
    const rows = await db.equipmentPrice.findMany({
      where: { equipmentId: { in: [...new Set(equipmentIds)] } },
      orderBy: { validFrom: 'asc' },
    });
    const history = new Map<string, { from: number; prices: PriceTable }[]>();

    for (const row of rows) {
      const entries = history.get(row.equipmentId) ?? [];

      entries.push({ from: row.validFrom.getTime(), prices: priceTable(row) });
      history.set(row.equipmentId, entries);
    }

    return (equipmentId: string, at: Date): PriceTable => {
      const entries = history.get(equipmentId);

      if (!entries?.length) {
        const known = fallback.get(equipmentId);

        if (!known) throw new ApiException('internal_error');

        return known;
      }

      // Antes do primeiro registro vale o mais antigo que se conhece.
      let current = entries[0];

      for (const entry of entries) {
        if (entry.from <= at.getTime()) current = entry;
      }

      return current.prices;
    };
  }

  private snapshotOf(items: BillingItem[]): Map<string, PriceTable> {
    return new Map(items.map((item) => [item.equipmentId, priceTable(item)]));
  }

  /** O contrato com o que a conta precisa, ou `contract_not_found`. */
  async contract(
    id: string,
    db: Db = this.prisma,
  ): Promise<BillingContractRecord> {
    const contract = await db.eLease.findUnique({
      where: { id },
      include: CONTRACT_INCLUDE,
    });

    if (!contract) throw new ApiException('contract_not_found');

    return contract;
  }

  /**
   * O extrato calculado agora. Ativo corre ate `asOf`; concluido, ate o
   * fechamento; e a indenizacao sai pelo preco do mesmo dia (clausula 7a).
   */
  async compute(
    contract: BillingContractRecord,
    asOf: Date = new Date(),
    db: Db = this.prisma,
  ): Promise<Statement> {
    const until =
      contract.status === LeaseStatus.COMPLETED && contract.finishDate
        ? contract.finishDate
        : asOf;
    const priceAt = await this.priceLookup(
      contract.leaseItems.map((item) => item.equipmentId),
      this.snapshotOf(contract.leaseItems),
      db,
    );

    return buildStatement({
      contract,
      items: contract.leaseItems,
      asOf: until,
      indemnityDate: until,
      priceAt,
    });
  }

  /**
   * O extrato de um contrato concluido e o que foi gravado no fechamento, na
   * auditoria: o historico nao muda depois. Contrato fechado antes disso existir
   * e calculado de novo.
   */
  async frozen(contractId: string): Promise<StatementDto | null> {
    const closing = await this.prisma.auditLog.findFirst({
      where: { contractId, action: AuditAction.CONTRACT_COMPLETED },
      orderBy: { createdAt: 'desc' },
    });
    const statement = (closing?.metadata as { statement?: StatementDto } | null)
      ?.statement;

    return statement ?? null;
  }

  async statement(contractId: string): Promise<StatementDto> {
    const contract = await this.contract(contractId);

    if (contract.status === LeaseStatus.COMPLETED) {
      const frozen = await this.frozen(contractId);

      if (frozen) return frozen;
    }

    return statementToApi(await this.compute(contract));
  }

  /**
   * O fechamento do mes: os contratos fechados nele, com o valor cobrado, e os
   * que atravessaram o fim do mes ainda ativos, com o que correu ate la. Junto,
   * o que estava na obra no fim do mes e o que foi para manutencao ou foi
   * roubado durante ele.
   */
  async closing(month: string) {
    const { from, to } = monthRange(month);
    const now = new Date();
    const asOf =
      to.getTime() > now.getTime() ? now : new Date(to.getTime() - 1);

    const contracts = await this.prisma.eLease.findMany({
      where: {
        startDate: { lt: to },
        OR: [
          { status: LeaseStatus.ACTIVE },
          { status: LeaseStatus.COMPLETED, finishDate: { gte: from } },
        ],
      },
      include: CONTRACT_INCLUDE,
      orderBy: { startDate: 'asc' },
    });

    const closed: {
      contractId: string;
      client: string;
      lessee: string;
      startDate: string;
      finishDate: string;
      rental: number;
      indemnity: number;
      total: number;
    }[] = [];
    const active: {
      contractId: string;
      client: string;
      lessee: string;
      startDate: string;
      plannedEndDate: string;
      overdue: boolean;
      contracted: number;
      accrued: number;
    }[] = [];
    const onSite: {
      contractId: string;
      lessee: string;
      code: string;
      name: string;
      since: string;
    }[] = [];
    const maintenance: {
      contractId: string;
      lessee: string;
      code: string;
      name: string;
      date: string;
      replaced: boolean;
    }[] = [];
    const stolen: {
      contractId: string;
      lessee: string;
      code: string;
      name: string;
      date: string;
      indemnity: number;
    }[] = [];

    for (const contract of contracts) {
      const closedInMonth =
        contract.status === LeaseStatus.COMPLETED &&
        contract.finishDate !== null &&
        contract.finishDate.getTime() < to.getTime();

      const statement: StatementDto = closedInMonth
        ? ((await this.frozen(contract.id)) ??
          statementToApi(await this.compute(contract)))
        : statementToApi(
            await this.compute(
              { ...contract, status: LeaseStatus.ACTIVE },
              asOf,
            ),
          );

      const parties = {
        contractId: contract.id,
        client: contract.lessee.client.name,
        lessee: contract.lessee.name,
      };

      if (closedInMonth) {
        closed.push({
          ...parties,
          startDate: contract.startDate.toISOString(),
          finishDate: (contract.finishDate as Date).toISOString(),
          rental: statement.totals.rental,
          indemnity: statement.totals.indemnity,
          total: statement.totals.total,
        });
      } else {
        active.push({
          ...parties,
          startDate: contract.startDate.toISOString(),
          plannedEndDate: contract.endDate.toISOString(),
          overdue: contract.endDate.getTime() < asOf.getTime(),
          contracted: statement.totals.contracted,
          accrued: statement.totals.total,
        });

        for (const item of contract.leaseItems) {
          const out =
            item.startDate.getTime() < to.getTime() &&
            (item.finishDate === null ||
              item.finishDate.getTime() >= to.getTime());

          if (out) {
            onSite.push({
              contractId: contract.id,
              lessee: contract.lessee.name,
              code: unitCode(item.equipmentCode, item.equipmentSuffix),
              name: item.equipmentName,
              since: item.startDate.toISOString(),
            });
          }
        }
      }

      const replaced = new Set(
        contract.leaseItems.map((item) => item.replacesItemId).filter(Boolean),
      );
      const indemnities = new Map<string, number>(
        statement.positions.flatMap((position) =>
          position.lines.flatMap((line) =>
            line.kind === 'indemnity'
              ? [[line.itemId, line.amount] as const]
              : [],
          ),
        ),
      );

      for (const item of contract.leaseItems) {
        const inMonth =
          item.finishDate !== null &&
          item.finishDate.getTime() >= from.getTime() &&
          item.finishDate.getTime() < to.getTime();

        if (!inMonth) continue;

        const event = {
          contractId: contract.id,
          lessee: contract.lessee.name,
          code: unitCode(item.equipmentCode, item.equipmentSuffix),
          name: item.equipmentName,
          date: (item.finishDate as Date).toISOString(),
        };

        if (item.finalStatus === 'MAINTENANCE') {
          maintenance.push({ ...event, replaced: replaced.has(item.id) });
        } else if (item.finalStatus === 'STOLEN') {
          stolen.push({ ...event, indemnity: indemnities.get(item.id) ?? 0 });
        }
      }
    }

    const sum = <T>(rows: T[], pick: (row: T) => number): number =>
      reais(
        rows.reduce((total, row) => total + Math.round(pick(row) * 100), 0),
      );

    return {
      month,
      from: from.toISOString(),
      to: to.toISOString(),
      asOf: asOf.toISOString(),
      summary: {
        closedContracts: closed.length,
        billed: sum(closed, (row) => row.total),
        rental: sum(closed, (row) => row.rental),
        indemnity: sum(closed, (row) => row.indemnity),
        activeContracts: active.length,
        activeContracted: sum(active, (row) => row.contracted),
        activeAccrued: sum(active, (row) => row.accrued),
        overdueContracts: active.filter((row) => row.overdue).length,
        onSite: onSite.length,
        maintenance: maintenance.length,
        stolen: stolen.length,
        // Roubos do mes, com contrato fechado ou nao: o que o fechado ja cobrou e o que o ativo vai cobrar.
        stolenIndemnity: sum(stolen, (row) => row.indemnity),
      },
      closed,
      active,
      onSite,
      maintenance,
      stolen,
    };
  }

  /**
   * A calculadora: um contrato de mentira, com os equipamentos escolhidos, o
   * prazo e a devolucao de cada um, calculado pela mesma conta dos contratos de
   * verdade. Cada equipamento corre ate a propria devolucao; defeito e roubo
   * entram com a data e com ou sem substituto.
   */
  async simulate(dto: SimulationDto): Promise<StatementDto> {
    const ids = dto.items.map((item) => item.equipmentId);
    const equipments = await this.prisma.equipment.findMany({
      where: { id: { in: ids } },
    });

    if (equipments.length !== ids.length) {
      throw new ApiException('equipment_not_found');
    }

    const start = new Date(dto.startDate);
    const plannedEnd = new Date(dto.plannedEndDate);

    // Devolucao antes da retirada nao existe, e depois do teto a conta vira
    // ataque: a recusa diz qual campo, como a validacao do DTO.
    const latest = start.getTime() + MAX_SIMULATION_DAYS * MS_PER_DAY;
    const refused = dto.items.flatMap((item, index) => {
      const returned = new Date(item.returnDate).getTime();
      const field = `items.${index}.returnDate`;

      if (returned < start.getTime()) {
        return [
          {
            field,
            error: 'end_before_start',
            message: 'returnDate cannot be before startDate',
          },
        ];
      }

      return returned > latest
        ? [
            {
              field,
              error: 'period_too_long',
              message: 'returnDate is too far from startDate',
            },
          ]
        : [];
    });

    if (refused.length > 0) {
      throw new ApiException('validation_failed', { fields: refused });
    }

    const byId = new Map(
      equipments.map((equipment) => [equipment.id, equipment]),
    );
    const priceAt = await this.priceLookup(
      ids,
      new Map(
        equipments.map((equipment) => [equipment.id, priceTable(equipment)]),
      ),
    );
    const between = (date: Date, from: Date, until: Date): Date =>
      new Date(
        Math.min(Math.max(date.getTime(), from.getTime()), until.getTime()),
      );

    const items: BillingItem[] = dto.items.flatMap((entry) => {
      const equipment = byId.get(entry.equipmentId);

      if (!equipment) return [];

      const returned = new Date(entry.returnDate);
      // O contrato congela a tabela do dia da assinatura (7a).
      const atSigning = priceAt(equipment.id, start);
      const base = {
        equipmentId: equipment.id,
        equipmentName: equipment.name,
        equipmentCode: equipment.code,
        equipmentSuffix: equipment.suffix,
        p_diary: reais(atSigning.daily),
        p_weekly: atSigning.weekly === null ? null : reais(atSigning.weekly),
        p_biweekly:
          atSigning.biweekly === null ? null : reais(atSigning.biweekly),
        p_monthly: atSigning.monthly === null ? null : reais(atSigning.monthly),
        p_indemnity: reais(atSigning.indemnity),
        startStatus: 'LEASED',
      };
      const event = entry.event;

      if (!event) {
        return [
          {
            ...base,
            id: equipment.id,
            startDate: start,
            finishDate: returned,
            finalStatus: 'AVAILABLE',
            replacesItemId: null,
          },
        ];
      }

      // Sem substituto, a unidade sai da obra na ocorrencia, e a devolucao nao
      // conta; com substituto, a ocorrencia fica entre a retirada e a devolucao.
      const when = event.replaced
        ? between(new Date(event.date), start, returned)
        : new Date(Math.max(new Date(event.date).getTime(), start.getTime()));
      const original: BillingItem = {
        ...base,
        id: equipment.id,
        startDate: start,
        finishDate: when,
        finalStatus: event.kind === 'stolen' ? 'STOLEN' : 'MAINTENANCE',
        replacesItemId: null,
      };

      // O substituto e outra unidade do mesmo codigo; na simulacao, com a mesma tabela.
      return event.replaced
        ? [
            original,
            {
              ...base,
              id: `${equipment.id}:substituto`,
              startDate: when,
              finishDate: returned,
              startStatus: 'REPLACE',
              finalStatus: 'AVAILABLE',
              replacesItemId: equipment.id,
            },
          ]
        : [original];
    });

    // O contrato fecha na ultima volta, e a indenizacao sai pelo preco desse dia (7a).
    const finish = new Date(
      Math.max(...items.map((item) => (item.finishDate as Date).getTime())),
    );

    return statementToApi(
      buildStatement({
        contract: {
          id: 'simulacao',
          status: LeaseStatus.COMPLETED,
          startDate: start,
          endDate: plannedEnd,
          finishDate: finish,
        },
        items,
        asOf: finish,
        indemnityDate: finish,
        priceAt,
      }),
    );
  }
}

export type ClosingDto = Awaited<ReturnType<BillingService['closing']>>;
