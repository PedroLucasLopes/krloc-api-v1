import PdfPrinter from 'pdfmake/src/printer';
import type {
  Alignment,
  Content,
  ContentTable,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import { DocumentIssuer } from '../types/documentTemplate';

const FONTS = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

const printer = new PdfPrinter(FONTS);

const LINE = '____________________________________________';

const GREY = '#bfbfbf';

export const styles: TDocumentDefinitions['styles'] = {
  title: {
    fontSize: 16,
    bold: true,
    alignment: 'center',
    margin: [0, 0, 0, 12],
  },
  section: { fontSize: 11, bold: true, margin: [0, 12, 0, 6] },
  paragraph: { fontSize: 9, margin: [0, 0, 0, 6], alignment: 'justify' },
  label: { fontSize: 10, bold: true },
  tableHeader: { fontSize: 8, bold: true },
  cell: { fontSize: 8 },
  note: {
    fontSize: 7,
    color: '#555555',
    margin: [0, 8, 0, 0],
    alignment: 'justify',
  },
  signature: { fontSize: 9, alignment: 'center' },
};

export const paragraph = (text: string, style = 'paragraph'): Content => ({
  text,
  style,
});

export const title = (text: string): Content => ({ text, style: 'title' });

export const section = (text: string): Content => ({ text, style: 'section' });

export const labelValue = (label: string, value: string): Content => ({
  text: [
    { text: `${label}: `, style: 'label' },
    { text: value, fontSize: 10 },
  ],
  margin: [0, 0, 0, 3],
});

export function table(
  headers: string[],
  rows: string[][],
  options: {
    right?: number[];
    widths?: (string | number)[];
    boldLastRow?: boolean;
  } = {},
): Content {
  const right = new Set(options.right ?? []);
  const cell = (text: string, column: number, bold: boolean): TableCell => ({
    text,
    style: bold ? 'tableHeader' : 'cell',
    alignment: (right.has(column) ? 'right' : 'left') as Alignment,
    margin: [0, 3, 0, 3],
  });

  const body: ContentTable['table']['body'] = [
    headers.map((text, column) => cell(text, column, true)),
    ...rows.map((row, index) =>
      row.map((text, column) =>
        cell(text, column, !!options.boldLastRow && index === rows.length - 1),
      ),
    ),
  ];

  return {
    table: {
      headerRows: 1,
      widths: options.widths ?? ['*', ...headers.slice(1).map(() => 'auto')],
      body,
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => GREY,
      vLineColor: () => GREY,
      paddingLeft: () => 5,
      paddingRight: () => 5,
    },
    margin: [0, 0, 0, 8],
  };
}

export const signatures = (left: string, right: string): Content => ({
  table: {
    widths: ['*', '*'],
    body: [
      [
        { text: LINE, style: 'signature' },
        { text: LINE, style: 'signature' },
      ],
      [
        { text: left, style: 'signature' },
        { text: right, style: 'signature' },
      ],
    ],
  },
  layout: 'noBorders',
  margin: [0, 24, 0, 0],
});

export function documentOf(
  content: Content[],
  options: { logo: string | null; issuer: DocumentIssuer },
): TDocumentDefinitions {
  const header: TDocumentDefinitions['header'] = options.logo
    ? () => ({
        image: options.logo as string,
        width: 150,
        alignment: 'center',
        margin: [0, 14, 0, 0],
      })
    : undefined;

  return {
    pageSize: 'A4',
    pageMargins: [48, options.logo ? 86 : 48, 48, 56],
    defaultStyle: { font: 'Helvetica', fontSize: 9 },
    styles,
    header,
    footer: (page, pages) => ({
      text: `${options.issuer.name} · CNPJ ${options.issuer.taxId} · página ${page} de ${pages}`,
      fontSize: 7,
      color: '#666666',
      alignment: 'center',
      margin: [0, 16, 0, 0],
    }),
    content,
  };
}

export function render(definition: TDocumentDefinitions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = printer.createPdfKitDocument(definition);
    const chunks: Buffer[] = [];

    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
    document.end();
  });
}
