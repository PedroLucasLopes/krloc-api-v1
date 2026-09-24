import { Injectable } from '@nestjs/common';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  WidthType,
} from 'docx';
import type { StatementDto } from 'src/routes/finantial/billing/statement';
import type {
  BillingContractRecord,
  ClosingDto,
} from 'src/routes/finantial/service/billing.service';
import {
  date,
  dateTime,
  END_TEXT,
  labelValue,
  lineText,
  logoHeader,
  money,
  paragraph,
  sectionTitle,
  table,
  title,
} from '../helper/report.helper';

const RETURN_TEXT: Record<string, string> = {
  AVAILABLE: 'devolvido em condições de uso',
  MAINTENANCE: 'devolvido para manutenção',
  STOLEN: 'roubado',
};

const CLAUSES =
  'Cálculo pelas cláusulas do contrato de locação: cada equipamento é cobrado pelos dias ' +
  'corridos da retirada à efetiva devolução (1ª, parágrafo segundo), na combinação mais ' +
  'barata de diária, semana, quinzena e mês da tabela da data da assinatura (7ª); vencido o ' +
  'período contratado, prorrogação por igual período pela tabela em vigor no vencimento ' +
  '(5ª) e dias excedentes a 10% do valor mensal atual (parágrafo único da 5ª); indenização ' +
  'de equipamento pelo valor do dia do pagamento (6ª e 7ª).';

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

function signatures(): Table {
  const none = { style: BorderStyle.NONE, size: 0 };
  const line = (text: string) =>
    new TableCell({
      children: [
        new Paragraph({
          text: '____________________________________________',
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({ text, alignment: AlignmentType.CENTER }),
      ],
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: none,
      bottom: none,
      left: none,
      right: none,
      insideHorizontal: none,
      insideVertical: none,
    },
    rows: [
      new TableRow({
        children: [line('LOCADOR(A): KRLOC'), line('LOCATÁRIO(A)')],
      }),
    ],
  });
}

async function pack(children: (Paragraph | Table)[]): Promise<Buffer> {
  const document = new Document({
    sections: [{ headers: { default: logoHeader() }, children }],
  });

  return Packer.toBuffer(document);
}

@Injectable()
export class ReportFormatService {
  async statement(
    contract: BillingContractRecord,
    statement: StatementDto,
    kind: 'extract' | 'release',
  ): Promise<Buffer> {
    const { lessee } = contract;
    const release = kind === 'release';

    const children: (Paragraph | Table)[] = [
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
      ...(release
        ? [labelValue('Fechamento', date(statement.finishDate))]
        : []),
      labelValue('Período contratado', `${statement.plannedDays} dia(s)`),
    ];

    statement.positions.forEach((position, index) => {
      const [first] = position.units;

      children.push(
        sectionTitle(`Equipamento ${index + 1}: ${first.code} · ${first.name}`),
      );

      for (const unit of position.units) {
        const until = unit.end ? date(unit.end) : 'hoje';
        const evaluation = unit.finalStatus
          ? RETURN_TEXT[unit.finalStatus]
          : 'na obra';

        children.push(
          paragraph(
            `${unit.code} ${unit.name}: de ${date(unit.start)} a ${until} · ${evaluation}`,
          ),
        );
      }

      children.push(
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
          { right: [2], boldLastRow: true },
        ),
      );
    });

    children.push(
      sectionTitle('Totais'),
      table(
        ['Aluguel', 'Indenizações', 'Total'],
        [
          [
            money(statement.totals.rental),
            money(statement.totals.indemnity),
            money(statement.totals.total),
          ],
        ],
        { right: [0, 1, 2], boldLastRow: true },
      ),
      paragraph(''),
      paragraph(CLAUSES, { size: 16 }),
    );

    if (release) {
      children.push(paragraph('', { after: 600 }), signatures());
    }

    return pack(children);
  }

  async closing(closing: ClosingDto): Promise<Buffer> {
    const { summary } = closing;

    const children: (Paragraph | Table)[] = [
      title(`FECHAMENTO DE ${monthName(closing.month).toUpperCase()}`),
      paragraph(
        `Gerado em ${dateTime(new Date())}. Contratos ativos e frota contados até ${date(closing.asOf)}.`,
      ),

      sectionTitle('Resumo'),
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
        { right: [1] },
      ),

      sectionTitle('Contratos fechados'),
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

      sectionTitle('Contratos ativos no fim do mês'),
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

      sectionTitle('Equipamentos na obra'),
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

      sectionTitle('Manutenções no mês'),
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

      sectionTitle('Roubos no mês'),
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

      paragraph(''),
      paragraph(CLAUSES, { size: 16 }),
    ];

    return pack(children);
  }
}
