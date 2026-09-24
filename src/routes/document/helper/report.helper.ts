import {
  AlignmentType,
  BorderStyle,
  Header,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  ImageRun,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  TextWrappingType,
  VerticalAlign,
  VerticalPositionAlign,
  VerticalPositionRelativeFrom,
  WidthType,
} from 'docx';
import * as fs from 'fs';
import * as path from 'path';
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

const FONT = 'Calibri';

export const run = (text: string, bold = false, size = 20): TextRun =>
  new TextRun({ text, font: FONT, size, bold });

export const paragraph = (
  text: string,
  options: {
    bold?: boolean;
    size?: number;
    center?: boolean;
    after?: number;
  } = {},
): Paragraph =>
  new Paragraph({
    alignment: options.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { after: options.after ?? 120 },
    children: [run(text, options.bold, options.size)],
  });

export const title = (text: string): Paragraph =>
  paragraph(text, { bold: true, size: 32, center: true, after: 240 });

export const sectionTitle = (text: string): Paragraph =>
  new Paragraph({
    spacing: { before: 240, after: 120 },
    children: [run(text, true, 24)],
  });

export const labelValue = (label: string, value: string): Paragraph =>
  new Paragraph({
    spacing: { after: 60 },
    children: [run(`${label}: `, true), run(value)],
  });

const thin = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };

export function table(
  headers: string[],
  rows: string[][],
  options: { right?: number[]; boldLastRow?: boolean } = {},
): Table {
  const right = new Set(options.right ?? []);
  const cell = (text: string, index: number, bold: boolean): TableCell =>
    new TableCell({
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
      children: [
        new Paragraph({
          alignment: right.has(index)
            ? AlignmentType.RIGHT
            : AlignmentType.LEFT,
          children: [run(text, bold, 18)],
        }),
      ],
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: thin,
      bottom: thin,
      left: thin,
      right: thin,
      insideHorizontal: thin,
      insideVertical: thin,
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((text, index) => cell(text, index, true)),
      }),
      ...rows.map(
        (row, rowIndex) =>
          new TableRow({
            children: row.map((text, index) =>
              cell(
                text,
                index,
                !!options.boldLastRow && rowIndex === rows.length - 1,
              ),
            ),
          }),
      ),
    ],
  });
}

export function logoHeader(): Header {
  const logo = fs.readFileSync(
    path.resolve(process.cwd(), 'src/global/assets/logo.png'),
  );

  return new Header({
    children: [
      new Paragraph({
        children: [
          new ImageRun({
            data: logo,
            type: 'png',
            transformation: { width: 286, height: 138 },
            floating: {
              horizontalPosition: {
                relative: HorizontalPositionRelativeFrom.PAGE,
                align: HorizontalPositionAlign.CENTER,
              },
              verticalPosition: {
                relative: VerticalPositionRelativeFrom.PAGE,
                align: VerticalPositionAlign.CENTER,
              },
              wrap: { type: TextWrappingType.NONE },
            },
          }),
        ],
      }),
    ],
  });
}
