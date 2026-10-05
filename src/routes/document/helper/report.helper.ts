import { BUSINESS_TIME_ZONE } from 'src/routes/finantial/billing/calendar';
import type { StatementLineDto } from 'src/routes/finantial/billing/statement';

const moneyFormat = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BUSINESS_TIME_ZONE,
});

const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BUSINESS_TIME_ZONE,
  dateStyle: 'short',
  timeStyle: 'short',
});

export const money = (value: number): string => moneyFormat.format(value);

export const moneyOrDash = (value: number | null): string =>
  value === null ? '—' : money(value);

export const date = (value: string | Date | null): string =>
  value === null ? '—' : dateFormat.format(new Date(value));

export const dateTime = (value: string | Date): string =>
  dateTimeFormat.format(new Date(value));

const PACKAGE_NAMES: Record<string, [string, string]> = {
  monthly: ['mês', 'meses'],
  biweekly: ['quinzena', 'quinzenas'],
  weekly: ['semana', 'semanas'],
  daily: ['diária', 'diárias'],
};

export const packagesText = (
  packages: { kind: string; count: number }[],
): string =>
  packages
    .map(
      ({ kind, count }) =>
        `${count} ${PACKAGE_NAMES[kind][count === 1 ? 0 : 1]}`,
    )
    .join(' + ');

export const daysText = (days: number): string =>
  days === 1 ? '1 dia' : `${days} dias`;

export function lineText(line: StatementLineDto): [string, string] {
  switch (line.kind) {
    case 'contracted':
      return [
        `Período contratado (${daysText(line.days)})`,
        packagesText(line.packages),
      ];
    case 'usage':
      return [
        `Uso na obra (${daysText(line.days)})`,
        packagesText(line.packages),
      ];
    case 'renewal': {
      const count = line.count ?? 1;

      return count === 1
        ? [
            `Prorrogação ${line.index}, a partir de ${date(line.from)} (cláusula 5ª)`,
            packagesText(line.packages),
          ]
        : [
            `Prorrogações ${line.index} a ${line.index + count - 1}, a partir de ${date(line.from)} (cláusula 5ª)`,
            `${count} × (${packagesText(line.packages)})`,
          ];
    }
    case 'excess':
      return [
        'Dias excedentes (parágrafo único da cláusula 5ª)',
        line.monthly === null
          ? `${daysText(line.days)} × ${money(line.dailyRate)} (diária: sem valor mensal na tabela)`
          : `${daysText(line.days)} × ${money(line.dailyRate)} (10% do mensal de ${money(line.monthly)})`,
      ];
    case 'indemnity':
      return [
        `Indenização da unidade ${line.code} (cláusulas 6ª e 7ª)`,
        'valor do equipamento no dia do pagamento',
      ];
  }
}

export const END_TEXT: Record<string, string> = {
  returned: 'devolvido',
  defect: 'manutenção por defeito',
  stolen: 'roubado',
  open: 'na obra',
};
