export type PackageKind = 'monthly' | 'biweekly' | 'weekly' | 'daily';

export const PACKAGE_DAYS: Readonly<Record<PackageKind, number>> = {
  monthly: 30,
  biweekly: 15,
  weekly: 7,
  daily: 1,
};

const ORDER: readonly PackageKind[] = [
  'monthly',
  'biweekly',
  'weekly',
  'daily',
];

export interface PriceTable {
  daily: number;
  weekly: number | null;
  biweekly: number | null;
  monthly: number | null;
  indemnity: number;
}

export function toCents(value: number): number;
export function toCents(value: number | null | undefined): number | null;
export function toCents(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : Math.round(value * 100);
}

const offered = (cents: number | null): number | null =>
  cents !== null && cents > 0 ? cents : null;

export function priceTable(prices: {
  p_diary: number;
  p_weekly: number | null;
  p_biweekly: number | null;
  p_monthly: number | null;
  p_indemnity: number;
}): PriceTable {
  return {
    daily: toCents(prices.p_diary),
    weekly: offered(toCents(prices.p_weekly)),
    biweekly: offered(toCents(prices.p_biweekly)),
    monthly: offered(toCents(prices.p_monthly)),
    indemnity: toCents(prices.p_indemnity),
  };
}

export interface PackageLine {
  kind: PackageKind;
  count: number;
  unitPrice: number;
  amount: number;
}

export interface Cover {
  days: number;
  coveredDays: number;
  amount: number;
  packages: PackageLine[];
}

interface Best {
  cost: number;
  covered: number;
  count: number;
  choice: PackageKind | null;
}

const better = (a: Best, b: Best): boolean =>
  a.cost !== b.cost
    ? a.cost < b.cost
    : a.covered !== b.covered
      ? a.covered < b.covered
      : a.count < b.count;

export function cheapestCover(prices: PriceTable, days: number): Cover {
  const available = ORDER.filter((kind) => priceOf(prices, kind) !== null);
  const best: Best[] = [{ cost: 0, covered: 0, count: 0, choice: null }];

  for (let day = 1; day <= days; day++) {
    let current: Best | null = null;

    for (const kind of available) {
      const rest = best[Math.max(0, day - PACKAGE_DAYS[kind])];
      const candidate: Best = {
        cost: rest.cost + (priceOf(prices, kind) as number),
        covered: rest.covered + PACKAGE_DAYS[kind],
        count: rest.count + 1,
        choice: kind,
      };

      if (!current || better(candidate, current)) current = candidate;
    }

    best[day] = current as Best;
  }

  const counts = new Map<PackageKind, number>();

  for (let day = days; day > 0;) {
    const kind = best[day].choice as PackageKind;

    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    day = Math.max(0, day - PACKAGE_DAYS[kind]);
  }

  const packages = ORDER.filter((kind) => counts.has(kind)).map((kind) => {
    const count = counts.get(kind) as number;
    const unitPrice = priceOf(prices, kind) as number;

    return { kind, count, unitPrice, amount: count * unitPrice };
  });

  return {
    days,
    coveredDays: best[days].covered,
    amount: best[days].cost,
    packages,
  };
}

function priceOf(prices: PriceTable, kind: PackageKind): number | null {
  return kind === 'daily' ? prices.daily : prices[kind];
}
