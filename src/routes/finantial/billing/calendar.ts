/**
 * O calendario da cobranca. A empresa fatura em Sao Paulo: o dia da retirada e o
 * da devolucao sao os de la, e nao os do servidor nem os do UTC em que o banco
 * guarda as datas.
 */
export const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';

const MS_PER_DAY = 86_400_000;

// `en-CA` escreve a data como AAAA-MM-DD, que se le sem ambiguidade.
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

/** O dia do calendario da empresa em que cai o instante, contado desde 1970. */
export function businessDay(instant: Date): number {
  const [year, month, day] = dateFormatter
    .format(instant)
    .split('-')
    .map(Number);

  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/** O mesmo dia, como texto AAAA-MM-DD. */
export function businessDate(instant: Date): string {
  return dateFormatter.format(instant);
}

/** Quanto o relogio de Sao Paulo esta a frente do UTC naquele instante, em minutos. */
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

/** O instante em que comeca, em Sao Paulo, o dia de calendario `day`. */
export function dayStart(day: number): Date {
  const utcMidnight = new Date(day * MS_PER_DAY);

  return new Date(utcMidnight.getTime() - offsetMinutes(utcMidnight) * 60_000);
}

/**
 * Dias corridos da retirada a devolucao: a clausula 1a, paragrafo segundo, conta
 * sabado, domingo e feriado. Saiu no dia 1 e voltou no dia 16, sao 15 dias. O
 * minimo e 1: quem retira e devolve no mesmo dia usou uma diaria.
 */
export function calendarDays(start: Date, end: Date): number {
  return Math.max(1, businessDay(end) - businessDay(start));
}

/** O comeco do dia que fica `days` dias de calendario depois do dia de `start`. */
export function addDays(start: Date, days: number): Date {
  return dayStart(businessDay(start) + days);
}

/** O mes corrente em Sao Paulo, como AAAA-MM. */
export function currentMonth(now: Date = new Date()): string {
  return businessDate(now).slice(0, 7);
}

/** O intervalo do mes em Sao Paulo: do primeiro instante dele ao primeiro do seguinte. */
export function monthRange(month: string): { from: Date; to: Date } {
  const [year, number] = month.split('-').map(Number);
  const first = Math.round(Date.UTC(year, number - 1, 1) / MS_PER_DAY);
  const next = Math.round(Date.UTC(year, number, 1) / MS_PER_DAY);

  return { from: dayStart(first), to: dayStart(next) };
}
