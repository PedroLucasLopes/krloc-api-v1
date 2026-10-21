import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { StatementDto } from 'src/routes/finantial/billing/statement';
import type {
  BillingContractRecord,
  ClosingDto,
} from 'src/routes/finantial/service/billing.service';
import {
  date,
  dateTime,
  END_TEXT,
  lineText,
  money,
} from '../helper/report.helper';
import { ReportTemplate } from '../types/documentTemplate';
import {
  documentOf,
  labelValue,
  paragraph,
  section,
  signatures,
  table,
  title,
} from './pdf';

const RETURN_TEXT: Record<string, string> = {
  AVAILABLE: 'devolvido em condições de uso',
  MAINTENANCE: 'devolvido para manutenção',
  STOLEN: 'roubado',
};

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const monthName = (month: string): string => {
  const [year, number] = month.split('-').map(Number);

  return `${MONTHS[number - 1]} de ${year}`;
};

export function statementDefinition(
  contract: BillingContractRecord,
  statement: StatementDto,
  kind: 'extract' | 'release',
  template: ReportTemplate,
): TDocumentDefinitions {
  const { lessee } = contract;
  const release = kind === 'release';

  const content: Content[] = [
    title(release ? 'BAIXA DE CONTRATO' : 'EXTRATO DO CONTRATO'),
    paragraph(
      release
        ? 'Rescisão do contrato de locação, com os equipamentos e a avaliação de retorno de cada um (cláusula 10ª).'
        : `Contrato em andamento. Valores até ${date(statement.asOf)}, como se todos os equipamentos voltassem nesse dia.`,
    ),
    labelValue('Número do contrato', contract.id),
    labelValue(
      'Cliente',
      `${lessee.client.name} (CPF/CNPJ ${lessee.client.tax_id})`,
    ),
    labelValue(
      'Obra',
      `${lessee.name}, ${lessee.address}, ${lessee.city}/${lessee.state}`,
    ),
    labelValue('Início', date(statement.startDate)),
    labelValue('Término previsto', date(statement.plannedEndDate)),
    ...(release ? [labelValue('Fechamento', date(statement.finishDate))] : []),
    labelValue('Período contratado', `${statement.plannedDays} dia(s)`),
  ];

  statement.positions.forEach((position, index) => {
    const [first] = position.units;

    content.push(
      section(`Equipamento ${index + 1}: ${first.code} · ${first.name}`),
    );

    for (const unit of position.units) {
      const until = unit.end ? date(unit.end) : 'hoje';
      const evaluation = unit.finalStatus
        ? RETURN_TEXT[unit.finalStatus]
        : 'na obra';

      content.push(
        paragraph(
          `${unit.code} ${unit.name}: de ${date(unit.start)} a ${until} · ${evaluation}`,
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
  });

  content.push(
    section('Totais'),
    table(
      ['Aluguel', 'Indenizações', 'Total'],
      [
        [
          money(statement.totals.rental),
          money(statement.totals.indemnity),
          money(statement.totals.total),
        ],
      ],
      { right: [0, 1, 2], widths: ['*', '*', '*'], boldLastRow: true },
    ),
    paragraph(template.content.billingNote, 'note'),
  );

  if (release) {
    content.push(
      signatures(
        template.content.signatures.left.replaceAll(
          '{issuerName}',
          template.issuer.name,
        ),
        template.content.signatures.right,
      ),
    );
  }

  return documentOf(content, {
    logo: template.logo,
    issuer: template.issuer,
  });
}

export function closingDefinition(
  closing: ClosingDto,
  template: ReportTemplate,
): TDocumentDefinitions {
  const { summary } = closing;

  const content: Content[] = [
    title(`FECHAMENTO DE ${monthName(closing.month).toUpperCase()}`),
    paragraph(
      `Gerado em ${dateTime(new Date())}. Contratos ativos e frota contados até ${date(closing.asOf)}.`,
    ),

    section('Resumo'),
    table(
      ['Indicador', 'Valor'],
      [
        ['Contratos fechados no mês', String(summary.closedContracts)],
        ['Faturado nos fechados', money(summary.billed)],
        ['   aluguel', money(summary.rental)],
        ['   indenizações', money(summary.indemnity)],
        ['Contratos ativos no fim do mês', String(summary.activeContracts)],
        ['   atrasados', String(summary.overdueContracts)],
        ['Contratado nos ativos', money(summary.activeContracted)],
        ['Corrido nos ativos até o fechamento', money(summary.activeAccrued)],
        ['Equipamentos na obra', String(summary.onSite)],
        ['Manutenções no mês', String(summary.maintenance)],
        ['Roubos no mês', String(summary.stolen)],
        ['   indenizações dos roubos', money(summary.stolenIndemnity)],
      ],
      { right: [1], widths: ['*', 'auto'] },
    ),

    section('Contratos fechados'),
    closing.closed.length === 0
      ? paragraph('Nenhum contrato fechado no mês.')
      : table(
          [
            'Cliente',
            'Obra',
            'Início',
            'Fechamento',
            'Aluguel',
            'Indenização',
            'Total',
          ],
          closing.closed.map((row) => [
            row.client,
            row.lessee,
            date(row.startDate),
            date(row.finishDate),
            money(row.rental),
            money(row.indemnity),
            money(row.total),
          ]),
          { right: [4, 5, 6] },
        ),

    section('Contratos ativos no fim do mês'),
    closing.active.length === 0
      ? paragraph('Nenhum contrato ativo.')
      : table(
          [
            'Cliente',
            'Obra',
            'Início',
            'Término previsto',
            'Contratado',
            'Até o fechamento',
          ],
          closing.active.map((row) => [
            row.client,
            row.lessee,
            date(row.startDate),
            `${date(row.plannedEndDate)}${row.overdue ? ' (atrasado)' : ''}`,
            money(row.contracted),
            money(row.accrued),
          ]),
          { right: [4, 5] },
        ),

    section('Equipamentos na obra'),
    closing.onSite.length === 0
      ? paragraph('Nenhum equipamento na obra.')
      : table(
          ['Unidade', 'Equipamento', 'Obra', 'Desde'],
          closing.onSite.map((row) => [
            row.code,
            row.name,
            row.lessee,
            date(row.since),
          ]),
        ),

    section('Manutenções no mês'),
    closing.maintenance.length === 0
      ? paragraph('Nenhuma manutenção no mês.')
      : table(
          ['Unidade', 'Equipamento', 'Obra', 'Data', 'Substituído'],
          closing.maintenance.map((row) => [
            row.code,
            row.name,
            row.lessee,
            date(row.date),
            row.replaced ? 'sim' : 'não',
          ]),
        ),

    section('Roubos no mês'),
    closing.stolen.length === 0
      ? paragraph('Nenhum roubo no mês.')
      : table(
          ['Unidade', 'Equipamento', 'Obra', 'Data', 'Indenização'],
          closing.stolen.map((row) => [
            row.code,
            row.name,
            row.lessee,
            date(row.date),
            money(row.indemnity),
          ]),
          { right: [4] },
        ),

    paragraph(template.content.billingNote, 'note'),
  ];

  return documentOf(content, {
    logo: template.logo,
    issuer: template.issuer,
  });
}
