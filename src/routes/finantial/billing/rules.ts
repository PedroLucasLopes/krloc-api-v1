import { addDays, calendarDays } from './calendar';
import { cheapestCover, Cover, PackageLine, PriceTable } from './packages';

export type PositionEnd = 'returned' | 'defect' | 'stolen' | 'open';

export type FinalStatus = 'AVAILABLE' | 'MAINTENANCE' | 'STOLEN';

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
  plannedDays: number;
  contractPrices: PriceTable;
  units: PositionUnit[];
  asOf: Date;
  indemnityDate: Date;
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
  contracted: number;
  lines: ChargeLine[];
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

    const expired = Math.floor(days / plannedDays);

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
