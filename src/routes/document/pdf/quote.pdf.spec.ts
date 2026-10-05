import type { Content, ContentTable } from 'pdfmake/interfaces';
import type { StatementDto } from 'src/routes/finantial/billing/statement';
import { money } from '../helper/report.helper';
import { ReportTemplate } from '../types/documentTemplate';
import {
  contractQuoteDefinition,
  equipmentQuoteDefinition,
  QuoteUnit,
} from './quote.pdf';

const template: ReportTemplate = {
  id: 'modelo-1',
  kind: 'REPORT',
  version: 1,
  issuer: {
    name: 'KRLOC',
    taxId: '00.000.000/0001-00',
    address: 'Rua das Obras, 1',
    phone: '(31) 9 0000-0000',
    city: 'Contagem/MG',
  },
  content: {
    billingNote: 'nota de calculo',
    signatures: { left: '{issuerName}', right: 'Locataria' },
  },
  logo: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const units: QuoteUnit[] = [
  {
    code: 'KRBET-12',
    name: 'Betoneira 400L',
    daily: 30,
    weekly: 150,
    biweekly: null,
    monthly: 500,
    indemnity: 4000,
  },
];

const statement = {
  startDate: '2026-03-02T12:00:00.000Z',
  plannedEndDate: '2026-03-09T12:00:00.000Z',
  plannedDays: 7,
  positions: [
    {
      end: 'returned',
      missingPrice: false,
      start: '2026-03-02T12:00:00.000Z',
      endDate: '2026-03-09T12:00:00.000Z',
      days: 7,
      units: [
        {
          code: 'KRBET-12',
          name: 'Betoneira 400L',
          start: '2026-03-02T12:00:00.000Z',
          end: '2026-03-09T12:00:00.000Z',
        },
      ],
      lines: [
        {
          kind: 'contracted',
          days: 7,
          packages: [{ kind: 'weekly', count: 1, unitPrice: 150, amount: 150 }],
          amount: 150,
        },
      ],
      total: 150,
    },
  ],
  totals: { contracted: 150, rental: 150, indemnity: 0, total: 150 },
} as unknown as StatementDto;

const texts = (content: Content[]): string[] =>
  content.flatMap((item) => {
    const node = item as { text?: unknown };

    return typeof node.text === 'string' ? [node.text] : [];
  });

const rows = (content: Content[]): string[][] =>
  content
    .filter((item): item is ContentTable => 'table' in (item as ContentTable))
    .flatMap((item) =>
      item.table.body.map((row) =>
        row.map((cell) => String((cell as { text?: unknown }).text ?? '')),
      ),
    );

describe('orcamento em PDF', () => {
  it('lista o preco de cada periodo, com traco no periodo sem valor', () => {
    const definition = equipmentQuoteDefinition(units, template);
    const [header, line] = rows(definition.content as Content[]);

    expect(header).toEqual([
      'Unidade',
      'Equipamento',
      'Diária',
      'Semana',
      'Quinzena',
      'Mês',
      'Indenização',
    ]);

    expect(line).toEqual([
      'KRBET-12',
      'Betoneira 400L',
      money(30),
      money(150),
      '—',
      money(500),
      money(4000),
    ]);
  });

  it('diz que o orcamento de equipamentos nao e compromisso', () => {
    const definition = equipmentQuoteDefinition(units, template);

    expect(texts(definition.content as Content[]).join(' ')).toContain(
      'sem compromisso',
    );
  });

  it('o orcamento de contrato avisa que nada foi criado, e fecha nos totais', () => {
    const definition = contractQuoteDefinition(statement, template);
    const content = definition.content as Content[];
    const table = rows(content);
    const totals = table.at(-1);

    expect(texts(content)[1]).toContain('Nenhum contrato foi criado');
    expect(totals).toEqual([money(150), money(150), money(0), money(150)]);
  });

  it('avisa quando a unidade nao tem diaria na tabela', () => {
    const missing = {
      ...statement,
      positions: [{ ...statement.positions[0], missingPrice: true }],
    } as unknown as StatementDto;

    const definition = contractQuoteDefinition(missing, template);

    expect(texts(definition.content as Content[]).join(' ')).toContain(
      'não tem diária na tabela de preços',
    );
  });
});
