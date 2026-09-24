export const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';

const MS_PER_DAY = 86_400_000;

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const clockFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

export function businessDay(instant: Date): number {
  const [year, month, day] = dateFormatter
    .format(instant)
    .split('-')
    .map(Number);

  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

export function businessDate(instant: Date): string {
  return dateFormatter.format(instant);
}

function offsetMinutes(instant: Date): number {
  const parts = Object.fromEntries(
    clockFormatter
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  return Math.round((asUtc - instant.getTime()) / 60_000);
}

export function dayStart(day: number): Date {
  const utcMidnight = new Date(day * MS_PER_DAY);

  return new Date(utcMidnight.getTime() - offsetMinutes(utcMidnight) * 60_000);
}

export function calendarDays(start: Date, end: Date): number {
  return Math.max(1, businessDay(end) - businessDay(start));
}

export function addDays(start: Date, days: number): Date {
  return dayStart(businessDay(start) + days);
}

export function currentMonth(now: Date = new Date()): string {
  return businessDate(now).slice(0, 7);
}

export function monthRange(month: string): { from: Date; to: Date } {
  const [year, number] = month.split('-').map(Number);
  const first = Math.round(Date.UTC(year, number - 1, 1) / MS_PER_DAY);
  const next = Math.round(Date.UTC(year, number, 1) / MS_PER_DAY);

  return { from: dayStart(first), to: dayStart(next) };
}
