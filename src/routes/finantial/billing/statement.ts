import { ApiException } from 'src/global/error/apiError';
import { calendarDays } from './calendar';
import { PackageLine, priceTable, PriceTable } from './packages';
import {
  ChargeLine,
  chargePosition,
  FinalStatus,
  PositionCharge,
  PositionUnit,
  quotePosition,
} from './rules';

/** O que a conta le de um item de contrato. */
export interface BillingItem {
  id: string;
  equipmentId: string;
  equipmentName: string;
  equipmentCode: string;
  equipmentSuffix: number;
  p_diary: number;
  p_weekly: number | null;
  p_biweekly: number | null;
  p_monthly: number | null;
  p_indemnity: number;
  startDate: Date;
  finishDate: Date | null;
  startStatus: string;
  finalStatus: string | null;
  replacesItemId: string | null;
}

export interface BillingContract {
  id: string;
  status: string;
  startDate: Date;
  endDate: Date;
  finishDate: Date | null;
}

export type PriceLookup = (equipmentId: string, at: Date) => PriceTable;

export interface StatementPosition {
  units: PositionUnit[];
  charge: PositionCharge;
  /** Equipamento sem diaria na tabela: a conta sai zerada, e a tela avisa. */
  missingPrice: boolean;
}

/** O extrato de um contrato, em centavos. */
export interface Statement {
  contractId: string;
  status: string;
  startDate: Date;
  plannedEndDate: Date;
  finishDate: Date | null;
  asOf: Date;
  plannedDays: number;
  positions: StatementPosition[];
  totals: {
    contracted: number;
    rental: number;
    indemnity: number;
    total: number;
  };
}

/**
 * Teto de dias que a conta aceita, defesa por tras da validacao das datas: cem
 * anos. Cada dia e um passo da combinacao de pacotes, e a conta roda no mesmo
 * processo que atende todo o resto.
 */
export const MAX_BILLING_DAYS = 36_600;

export const unitCode = (code: string, suffix: number): string =>
  `${code}-${suffix}`;

const FINAL_STATUSES = new Set<string>(['AVAILABLE', 'MAINTENANCE', 'STOLEN']);

/**
 * As posicoes do contrato: cada item original com os substitutos que vieram
 * depois dele, em ordem. Item que substitui outro nao abre posicao propria.
 */
export function positionsOf(items: BillingItem[]): BillingItem[][] {
  const next = new Map<string, BillingItem>();

  for (const item of items) {
    if (item.replacesItemId) next.set(item.replacesItemId, item);
  }

  return items
    .filter((item) => !item.replacesItemId)
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
    .map((root) => {
      const chain = [root];

      for (let item = next.get(root.id); item; item = next.get(item.id)) {
        chain.push(item);
      }

      return chain;
    });
}

function toUnit(item: BillingItem): PositionUnit {
  return {
    itemId: item.id,
    equipmentId: item.equipmentId,
    code: unitCode(item.equipmentCode, item.equipmentSuffix),
    name: item.equipmentName,
    start: item.startDate,
    end: item.finishDate,
    finalStatus:
      item.finalStatus && FINAL_STATUSES.has(item.finalStatus)
        ? (item.finalStatus as FinalStatus)
        : null,
  };
}

/**
 * O contrato como estava em `asOf`: o que chegou depois fica de fora, e o que
 * voltou depois ainda estava na obra. E o que o fechamento de um mes passado le.
 */
function asItWas(items: BillingItem[], asOf: Date): BillingItem[] {
  return items
    .filter((item) => item.startDate.getTime() <= asOf.getTime())
    .map((item) =>
      item.finishDate && item.finishDate.getTime() > asOf.getTime()
        ? { ...item, finishDate: null, finalStatus: null }
        : item,
    );
}

/**
 * O extrato do contrato na data `asOf`. Pendente mostra o contratado; ativo, o
 * que correu ate `asOf`; concluido, o do fechamento. Cancelado nao cobra nada.
 */
export function buildStatement(input: {
  contract: BillingContract;
  items: BillingItem[];
  asOf: Date;
  indemnityDate: Date;
  priceAt: PriceLookup;
}): Statement {
  const { contract, indemnityDate, priceAt } = input;
  const plannedDays = calendarDays(contract.startDate, contract.endDate);

  if (plannedDays > MAX_BILLING_DAYS) {
    throw new ApiException('period_too_long');
  }

  const cancelled = contract.status === 'CANCELLED';
  // Pendente ainda nao correu: nao ha uso a contar, so o periodo contratado.
  const pending = contract.status === 'PENDING';
  const asOf = pending ? contract.startDate : input.asOf;
  const items =
    contract.status === 'ACTIVE' ? asItWas(input.items, asOf) : input.items;

  const positions = cancelled
    ? []
    : positionsOf(items).map((chain) => {
        const units = chain.map(toUnit);
        const contractPrices = priceTable(chain[0]);
        const last = chain[chain.length - 1];

        if (
          calendarDays(chain[0].startDate, last.finishDate ?? asOf) >
          MAX_BILLING_DAYS
        ) {
          throw new ApiException('period_too_long');
        }

        const charge = pending
          ? quotePosition({
              plannedDays,
              contractPrices,
              start: contract.startDate,
              end: contract.endDate,
            })
          : chargePosition({
              plannedDays,
              contractPrices,
              units,
              asOf,
              indemnityDate,
              priceAt,
            });

        return {
          units,
          charge,
          missingPrice: contractPrices.daily <= 0,
        };
      });

  const sum = (pick: (charge: PositionCharge) => number): number =>
    positions.reduce((total, position) => total + pick(position.charge), 0);

  return {
    contractId: contract.id,
    status: contract.status,
    startDate: contract.startDate,
    plannedEndDate: contract.endDate,
    finishDate: contract.finishDate,
    asOf,
    plannedDays,
    positions,
    totals: {
      contracted: sum((charge) => charge.contracted),
      rental: sum((charge) => charge.rental),
      indemnity: sum((charge) => charge.indemnity),
      total: sum((charge) => charge.total),
    },
  };
}

/* ------------------------------------------------------------------------ */
/* Na resposta da API: reais, com duas casas, e datas em ISO.               */
/* ------------------------------------------------------------------------ */

export const reais = (cents: number): number => Math.round(cents) / 100;

const reaisOrNull = (cents: number | null): number | null =>
  cents === null ? null : reais(cents);

const packageToApi = (line: PackageLine) => ({
  kind: line.kind,
  count: line.count,
  unitPrice: reais(line.unitPrice),
  amount: reais(line.amount),
});

function lineToApi(line: ChargeLine) {
  switch (line.kind) {
    case 'contracted':
    case 'usage':
      return {
        kind: line.kind,
        days: line.days,
        packages: line.packages.map(packageToApi),
        amount: reais(line.amount),
      };
    case 'renewal':
      return {
        kind: line.kind,
        index: line.index,
        count: line.count,
        from: line.from.toISOString(),
        days: line.days,
        packages: line.packages.map(packageToApi),
        unitAmount: reais(line.unitAmount),
        amount: reais(line.amount),
      };
    case 'excess':
      return {
        kind: line.kind,
        days: line.days,
        monthly: reaisOrNull(line.monthly),
        dailyRate: reais(line.dailyRate),
        amount: reais(line.amount),
      };
    case 'indemnity':
      return {
        kind: line.kind,
        itemId: line.itemId,
        code: line.code,
        amount: reais(line.amount),
      };
  }
}

export type StatementLineDto = ReturnType<typeof lineToApi>;

export function statementToApi(statement: Statement, frozen = false) {
  return {
    contractId: statement.contractId,
    status: statement.status,
    startDate: statement.startDate.toISOString(),
    plannedEndDate: statement.plannedEndDate.toISOString(),
    finishDate: statement.finishDate?.toISOString() ?? null,
    asOf: statement.asOf.toISOString(),
    plannedDays: statement.plannedDays,
    frozen,
    positions: statement.positions.map(({ units, charge, missingPrice }) => ({
      end: charge.end,
      missingPrice,
      start: charge.start.toISOString(),
      endDate: charge.endDate.toISOString(),
      days: charge.days,
      units: units.map((unit) => ({
        itemId: unit.itemId,
        equipmentId: unit.equipmentId,
        code: unit.code,
        name: unit.name,
        start: unit.start.toISOString(),
        end: unit.end?.toISOString() ?? null,
        finalStatus: unit.finalStatus,
      })),
      lines: charge.lines.map(lineToApi),
      contracted: reais(charge.contracted),
      rental: reais(charge.rental),
      indemnity: reais(charge.indemnity),
      total: reais(charge.total),
    })),
    totals: {
      contracted: reais(statement.totals.contracted),
      rental: reais(statement.totals.rental),
      indemnity: reais(statement.totals.indemnity),
      total: reais(statement.totals.total),
    },
  };
}

export type StatementDto = ReturnType<typeof statementToApi>;
