import type { Content } from 'pdfmake/interfaces';
import type { ELeaseById } from 'src/routes/elease/types/eLeaseById';
import type { StatementDto } from 'src/routes/finantial/billing/statement';
import { ContractBlock, ContractTemplate } from '../types/documentTemplate';
import { money } from '../helper/report.helper';
import { contractDefinition } from './contract.pdf';
import { render } from './pdf';

const ISSUER = {
  name: 'KRLOC',
  taxId: '00.000.000/0001-00',
  address: 'Rua das Obras, 1',
  phone: '(31) 9 0000-0000',
  city: 'Contagem/MG',
};

const RULED: ContractBlock[] = [
  { kind: 'clause', text: 'uso', billingRule: 'usage' },
  { kind: 'clause', text: 'prorrogacao', billingRule: 'renewal' },
  { kind: 'clause', text: 'excedente', billingRule: 'excess' },
  { kind: 'clause', text: 'indenizacao', billingRule: 'indemnity' },
];

const contract = {
  id: 'c0ffee',
  startDate: new Date('2026-03-02T12:00:00.000Z'),
  endDate: new Date('2026-03-09T12:00:00.000Z'),
  documentTemplateId: null,
  lessee: {
    name: 'Obra Central',
    address: 'Rua da Obra, 10',
    neighborhood: 'Centro',
    city: 'Contagem',
    state: 'MG',
    zipcode: '32000000',
    client: {
      name: 'Construtora Aurora',
      tax_id: '12345678000199',
      phone: '3133334444',
      address: 'Av. Principal, 99',
      neighborhood: 'Industrial',
      city: 'Contagem',
      state: 'MG',
      zipcode: '32010000',
    },
  },
  leaseItems: [
    {
      id: 'item-1',
      equipmentName: 'Betoneira 400L',
      equipmentCode: 'KRBET',
      equipmentSuffix: 12,
      p_diary: 30,
      p_weekly: 150,
      p_biweekly: null,
      p_monthly: 500,
      p_indemnity: 4000,
    },
  ],
} as unknown as ELeaseById;

const statement = {
  totals: { contracted: 150, rental: 150, indemnity: 0, total: 150 },
  positions: [{ units: [{ itemId: 'item-1' }], contracted: 150 }],
} as unknown as StatementDto;

const template = (blocks: ContractBlock[]): ContractTemplate => ({
  id: 'modelo-1',
  kind: 'CONTRACT',
  version: 1,
  issuer: ISSUER,
  content: { blocks },
  logo: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
});

const texts = (content: Content[]): string[] =>
  content.flatMap((item) => {
    const node = item as { text?: unknown };

    return typeof node.text === 'string' ? [node.text] : [];
  });

describe('contrato em PDF', () => {
  it('desenha os blocos na ordem em que o modelo os escreve', () => {
    const definition = contractDefinition(
      contract,
      statement,
      template([
        { kind: 'title', text: 'CONTRATO DE LOCAÇÃO' },
        { kind: 'section', text: 'CLÁUSULAS' },
        ...RULED,
      ]),
    );

    expect(texts(definition.content as Content[])).toEqual([
      'CONTRATO DE LOCAÇÃO',
      'CLÁUSULAS',
      'uso',
      'prorrogacao',
      'excedente',
      'indenizacao',
    ]);
  });

  it('troca os marcadores pelo emissor, pelas datas e pelo total', () => {
    const definition = contractDefinition(
      contract,
      statement,
      template([
        {
          kind: 'paragraph',
          text: '{issuerName} - CNPJ {issuerTaxId}, de {start} a {end}, por {total}',
        },
        ...RULED,
      ]),
    );

    expect(texts(definition.content as Content[])[0]).toBe(
      `KRLOC - CNPJ 00.000.000/0001-00, de 02/03/2026 a 09/03/2026, por ${money(150)}`,
    );
  });

  it('deixa marcador desconhecido como esta, em vez de apagar', () => {
    const definition = contractDefinition(
      contract,
      statement,
      template([{ kind: 'paragraph', text: 'vem do {inventado}' }, ...RULED]),
    );

    expect(texts(definition.content as Content[])[0]).toBe(
      'vem do {inventado}',
    );
  });

  it('monta a tabela de equipamentos com o valor contratado de cada item', () => {
    const definition = contractDefinition(
      contract,
      statement,
      template([
        {
          kind: 'items',
          columns: {
            quantity: 'Quantidade',
            product: 'Equipamento',
            model: 'Modelo',
            indemnity: 'Indenização',
            elease: 'Locação',
          },
        },
        ...RULED,
      ]),
    );

    const [primeiro] = definition.content as {
      table?: { body: unknown[][] };
    }[];
    const linha = primeiro.table?.body[1] as { text: string }[];

    expect(linha.map((cell) => cell.text)).toEqual([
      '1',
      'Betoneira 400L',
      'KRBET-12',
      money(4000),
      money(150),
    ]);
  });

  it('assina com o nome do emissor do modelo', () => {
    const definition = contractDefinition(
      contract,
      statement,
      template([
        {
          kind: 'signatures',
          left: 'LOCADOR(A): {issuerName}',
          right: 'LOCATÁRIO(A)',
        },
        ...RULED,
      ]),
    );

    const [assinaturas] = definition.content as {
      table?: { body: { text: string }[][] };
    }[];

    expect(assinaturas.table?.body[1].map((cell) => cell.text)).toEqual([
      'LOCADOR(A): KRLOC',
      'LOCATÁRIO(A)',
    ]);
  });

  it('sai como PDF de verdade, com acentuacao', async () => {
    const definition = contractDefinition(
      contract,
      statement,
      template([
        { kind: 'title', text: 'CONTRATO DE LOCAÇÃO' },
        { kind: 'paragraph', text: 'Prorrogação, indenização e manutenção.' },
        ...RULED,
      ]),
    );

    const buffer = await render(definition);

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
