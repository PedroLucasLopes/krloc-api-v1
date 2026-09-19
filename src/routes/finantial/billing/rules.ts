import { addDays, calendarDays } from './calendar';
import { cheapestCover, Cover, PackageLine, PriceTable } from './packages';

/**
 * A cobranca de uma posicao, pelas clausulas do contrato de locacao. Onde o
 * contrato nao fala, vale a regra de negocio da empresa, e cada uma esta marcada.
 *
 * Posicao e o lugar do equipamento no contrato: o original e os substitutos que
 * vieram depois dele. Ela e cobrada como um aluguel so, do inicio do original a
 * volta do ultimo (regra da empresa: quebra e troca nao mudam o que o cliente
 * paga).
 *
 * | Situacao | Cobranca |
 * |---|---|
 * | saiu da obra antes do fim do periodo contratado, por devolucao, defeito ou roubo | o uso: os dias corridos da retirada a efetiva devolucao (1a, paragrafo segundo), na combinacao mais barata de pacotes da tabela da assinatura (7a) |
 * | ficou o periodo inteiro | o valor contratado, que e o uso do periodo |
 * | passou do prazo | contratado + cada prorrogacao completa pela tabela em vigor no vencimento (5a) + os dias alem do ultimo periodo vencido a 10% do valor mensal atual (paragrafo unico da 5a) |
 * | roubo | alem do aluguel, a indenizacao do equipamento, pelo preco do dia do pagamento (6a e 7a) |
 *
 * O valor contratado e o do periodo inteiro: e o que o documento assinado diz e
 * o que a obra paga se ficar o prazo todo. Ele nao e piso: quem devolve antes
 * paga o que usou.
 *
 * Todo valor e em centavos.
 */

/** Como a posicao terminou. `open` e a que ainda esta na obra. */
export type PositionEnd = 'returned' | 'defect' | 'stolen' | 'open';

export type FinalStatus = 'AVAILABLE' | 'MAINTENANCE' | 'STOLEN';

/** Uma unidade da posicao: o original ou um substituto. */
export interface PositionUnit {
  itemId: string;
  equipmentId: string;
  code: string;
  name: string;
  start: Date;
  end: Date | null;
  finalStatus: FinalStatus | null;
}

export interface PositionInput {
  /** Os dias do periodo contratado, do inicio ao termino previsto. */
  plannedDays: number;
  /** A tabela da data da assinatura, congelada no item original (7a). */
  contractPrices: PriceTable;
  /** Em ordem: o original e os substitutos. */
  units: PositionUnit[];
  /** Ate quando conta a posicao que ainda esta na obra. */
  asOf: Date;
  /** O dia do preco da indenizacao: o do fechamento, ou o da consulta. */
  indemnityDate: Date;
  /** A tabela em vigor para o equipamento naquela data. */
  priceAt: (equipmentId: string, at: Date) => PriceTable;
}

export type ChargeLine =
  | {
      kind: 'contracted';
      days: number;
      packages: PackageLine[];
      amount: number;
    }
  | { kind: 'usage'; days: number; packages: PackageLine[]; amount: number }
  | {
      /**
       * Prorrogacoes seguidas com o mesmo preco viram uma linha: `count` delas, a
       * partir da de numero `index`, cada uma de `days` dias a `unitAmount`.
       */
      kind: 'renewal';
      index: number;
      count: number;
      from: Date;
      days: number;
      packages: PackageLine[];
      unitAmount: number;
      amount: number;
    }
  | {
      kind: 'excess';
      days: number;
      monthly: number | null;
      dailyRate: number;
      amount: number;
    }
  | { kind: 'indemnity'; itemId: string; code: string; amount: number };

export interface PositionCharge {
  end: PositionEnd;
  start: Date;
  endDate: Date;
  days: number;
  /** O valor do periodo contratado, pela tabela da assinatura. */
  contracted: number;
  lines: ChargeLine[];
  /** Aluguel: contratado, uso, prorrogacoes e excedente. */
  rental: number;
  indemnity: number;
  total: number;
}

function endOf(unit: PositionUnit): PositionEnd {
  if (unit.end === null) return 'open';
  if (unit.finalStatus === 'STOLEN') return 'stolen';
  if (unit.finalStatus === 'MAINTENANCE') return 'defect';

  return 'returned';
}

/** A unidade que estava na obra naquele dia: a ultima que ja tinha chegado. */
function unitOnSite(units: PositionUnit[], at: Date): PositionUnit {
  let current = units[0];

  for (const unit of units) {
    if (unit.start.getTime() <= at.getTime()) current = unit;
  }

  return current;
}

const samePackages = (a: PackageLine[], b: PackageLine[]): boolean =>
  a.length === b.length &&
  a.every(
    (line, index) =>
      line.kind === b[index].kind &&
      line.count === b[index].count &&
      line.unitPrice === b[index].unitPrice,
  );

/**
 * 10% do valor mensal atual por dia (paragrafo unico da 5a). Equipamento sem
 * mensal na tabela nao tem como seguir a clausula ao pe da letra: cobra a
 * diaria.
 */
export function excessDailyRate(prices: PriceTable): number {
  return prices.monthly !== null
    ? Math.round(prices.monthly / 10)
    : prices.daily;
}

export function chargePosition(input: PositionInput): PositionCharge {
  const { units, plannedDays, contractPrices, priceAt } = input;
  const root = units[0];
  const last = units[units.length - 1];
  const end = endOf(last);
  const endDate = last.end ?? input.asOf;
  const days = calendarDays(root.start, endDate);
  const contracted = cheapestCover(contractPrices, plannedDays);
  const lines: ChargeLine[] = [];

  if (days < plannedDays) {
    // Saiu antes do fim do periodo, por devolucao, defeito ou roubo, ou ainda
    // esta na obra e conta ate hoje: cobra os dias corridos ate a efetiva
    // devolucao (1a, paragrafo segundo). Cobrir menos dias nunca custa mais que o
    // periodo inteiro, entao o uso nunca passa do contratado.
    const usage = cheapestCover(contractPrices, days);

    lines.push({
      kind: 'usage',
      days,
      packages: usage.packages,
      amount: usage.amount,
    });
  } else {
    lines.push({
      kind: 'contracted',
      days: plannedDays,
      packages: contracted.packages,
      amount: contracted.amount,
    });

    // Cada periodo vencido depois do primeiro e uma prorrogacao por igual periodo,
    // pela tabela em vigor no dia em que ela comecou (5a).
    const expired = Math.floor(days / plannedDays);

    // A mesma tabela da o mesmo pacote: a conta sai uma vez por tabela, e as
    // prorrogacoes seguidas de mesmo preco viram uma linha so. Uma diaria
    // prorrogada por anos seria uma linha por dia.
    const covers = new Map<PriceTable, Cover>();
    const coverOf = (prices: PriceTable): Cover => {
      let cover = covers.get(prices);

      if (!cover) {
        cover = cheapestCover(prices, plannedDays);
        covers.set(prices, cover);
      }

      return cover;
    };
    let group: Extract<ChargeLine, { kind: 'renewal' }> | null = null;

    for (let index = 1; index < expired; index++) {
      const from = addDays(root.start, index * plannedDays);
      const renewal = coverOf(
        priceAt(unitOnSite(units, from).equipmentId, from),
      );

      if (
        group &&
        group.unitAmount === renewal.amount &&
        samePackages(group.packages, renewal.packages)
      ) {
        group.count += 1;
        group.amount += renewal.amount;
        continue;
      }

      group = {
        kind: 'renewal',
        index,
        count: 1,
        from,
        days: plannedDays,
        packages: renewal.packages,
        unitAmount: renewal.amount,
        amount: renewal.amount,
      };
      lines.push(group);
    }

    // Os dias alem do ultimo periodo vencido, na devolucao (paragrafo unico).
    const excess = days - expired * plannedDays;

    if (excess > 0) {
      const current = priceAt(last.equipmentId, endDate);
      const dailyRate = excessDailyRate(current);

      lines.push({
        kind: 'excess',
        days: excess,
        monthly: current.monthly,
        dailyRate,
        amount: excess * dailyRate,
      });
    }
  }

  // Roubo: a indenizacao do equipamento, pelo preco do dia do pagamento (6a e 7a).
  for (const unit of units) {
    if (unit.finalStatus !== 'STOLEN') continue;

    lines.push({
      kind: 'indemnity',
      itemId: unit.itemId,
      code: unit.code,
      amount: priceAt(unit.equipmentId, input.indemnityDate).indemnity,
    });
  }

  const rental = lines
    .filter((line) => line.kind !== 'indemnity')
    .reduce((sum, line) => sum + line.amount, 0);
  const indemnity = lines
    .filter((line) => line.kind === 'indemnity')
    .reduce((sum, line) => sum + line.amount, 0);

  return {
    end,
    start: root.start,
    endDate,
    days,
    contracted: contracted.amount,
    lines,
    rental,
    indemnity,
    total: rental + indemnity,
  };
}

/**
 * A posicao de um contrato que ainda nao comecou: o periodo contratado inteiro,
 * pela tabela da assinatura (7a). E o valor do documento que vai ser assinado,
 * o que a obra paga se ficar o prazo todo.
 */
export function quotePosition(input: {
  plannedDays: number;
  contractPrices: PriceTable;
  start: Date;
  end: Date;
}): PositionCharge {
  const contracted = cheapestCover(input.contractPrices, input.plannedDays);

  return {
    end: 'open',
    start: input.start,
    endDate: input.end,
    days: input.plannedDays,
    contracted: contracted.amount,
    lines: [
      {
        kind: 'contracted',
        days: input.plannedDays,
        packages: contracted.packages,
        amount: contracted.amount,
      },
    ],
    rental: contracted.amount,
    indemnity: 0,
    total: contracted.amount,
  };
}
