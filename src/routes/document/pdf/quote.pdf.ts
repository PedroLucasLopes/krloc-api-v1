import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { StatementDto } from 'src/routes/finantial/billing/statement';
import {
  date,
  dateTime,
  END_TEXT,
  lineText,
  money,
  moneyOrDash,
} from '../helper/report.helper';
import { ReportTemplate } from '../types/documentTemplate';
import {
  documentOf,
  labelValue,
  paragraph,
  section,
  table,
  title,
} from './pdf';

export interface QuoteUnit {
  code: string;
  name: string;
  daily: number;
  weekly: number | null;
  biweekly: number | null;
  monthly: number | null;
  indemnity: number;
}

const VALIDITY =
  'Orçamento sem compromisso, para consulta. Os valores são os da tabela de preços desta data e podem mudar; a locação só se formaliza pelo contrato assinado.';

const MISSING_PACKAGE =
  'Período sem valor na tabela aparece como traço. A cobrança desse equipamento usa a combinação mais barata entre os períodos com preço.';

export function equipmentQuoteDefinition(
  units: QuoteUnit[],
  template: ReportTemplate,
): TDocumentDefinitions {
  const content: Content[] = [
    title('ORÇAMENTO DE EQUIPAMENTOS'),
    paragraph(
      `Emitido em ${dateTime(new Date())}. Preço de locação de cada unidade, por período.`,
    ),
    table(
      [
        'Unidade',
        'Equipamento',
        'Diária',
        'Semana',
        'Quinzena',
        'Mês',
        'Indenização',
      ],
      units.map((unit) => [
        unit.code,
        unit.name,
        money(unit.daily),
        moneyOrDash(unit.weekly),
        moneyOrDash(unit.biweekly),
        moneyOrDash(unit.monthly),
        money(unit.indemnity),
      ]),
      {
        right: [2, 3, 4, 5, 6],
        widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto'],
      },
    ),
    paragraph(MISSING_PACKAGE, 'note'),
    paragraph(VALIDITY, 'note'),
    paragraph(template.content.billingNote, 'note'),
  ];

  return documentOf(content, { logo: template.logo, issuer: template.issuer });
}

export function contractQuoteDefinition(
  statement: StatementDto,
  template: ReportTemplate,
): TDocumentDefinitions {
  const content: Content[] = [
    title('ORÇAMENTO DE CONTRATO'),
    paragraph(
      `Simulação emitida em ${dateTime(new Date())}, para o período e as devoluções informados. Nenhum contrato foi criado.`,
    ),
    labelValue('Início', date(statement.startDate)),
    labelValue('Término previsto', date(statement.plannedEndDate)),
    labelValue('Período contratado', `${statement.plannedDays} dia(s)`),
  ];

  statement.positions.forEach((position, index) => {
    const [first] = position.units;

    content.push(
      section(`Equipamento ${index + 1}: ${first.code} · ${first.name}`),
    );

    for (const unit of position.units) {
      const until = unit.end ? date(unit.end) : 'o término previsto';

      content.push(
        paragraph(
          `${unit.code} ${unit.name}: de ${date(unit.start)} a ${until}.`,
        ),
      );
    }

    content.push(
      paragraph(
        `Uso da posição: ${position.days} dia(s), de ${date(position.start)} a ${date(position.endDate)} (${END_TEXT[position.end]}).`,
      ),
      table(
        ['Descrição', 'Detalhe', 'Valor'],
        [
          ...position.lines.map((line) => [
            ...lineText(line),
            money(line.amount),
          ]),
          ['Subtotal', '', money(position.total)],
        ],
        { right: [2], widths: ['*', 'auto', 'auto'], boldLastRow: true },
      ),
    );

    if (position.missingPrice) {
      content.push(
        paragraph(
          'Esta unidade não tem diária na tabela de preços: o valor sai zerado até que a tabela seja preenchida.',
          'note',
        ),
      );
    }
  });

  content.push(
    section('Totais'),
    table(
      ['Contratado', 'Aluguel', 'Indenizações', 'Total'],
      [
        [
          money(statement.totals.contracted),
          money(statement.totals.rental),
          money(statement.totals.indemnity),
          money(statement.totals.total),
        ],
      ],
      { right: [0, 1, 2, 3], widths: ['*', '*', '*', '*'], boldLastRow: true },
    ),
    paragraph(VALIDITY, 'note'),
    paragraph(template.content.billingNote, 'note'),
  );

  return documentOf(content, { logo: template.logo, issuer: template.issuer });
}
