import {
  ContractBlock,
  contractProblem,
  reportProblem,
} from './documentTemplate';

const ISSUER = {
  name: 'KRLOC',
  taxId: '00.000.000/0001-00',
  address: 'Rua das Obras, 1',
  phone: '(31) 9 0000-0000',
  city: 'Contagem/MG',
};

const RULED: ContractBlock[] = [
  { kind: 'clause', text: 'uso na obra', billingRule: 'usage' },
  { kind: 'clause', text: 'prorrogacao', billingRule: 'renewal' },
  { kind: 'clause', text: 'dias excedentes', billingRule: 'excess' },
  { kind: 'clause', text: 'indenizacao', billingRule: 'indemnity' },
];

const blocks = (extra: ContractBlock[] = []): ContractBlock[] => [
  { kind: 'title', text: 'CONTRATO DE LOCAÇÃO' },
  ...RULED,
  ...extra,
];

describe('modelo de contrato', () => {
  it('aceita um modelo com as quatro clausulas do motor', () => {
    expect(contractProblem(ISSUER, { blocks: blocks() })).toBeNull();
  });

  it('recusa o modelo que perdeu uma clausula do motor', () => {
    const semExcedente = blocks().filter(
      (block) => !('billingRule' in block) || block.billingRule !== 'excess',
    );

    expect(contractProblem(ISSUER, { blocks: semExcedente })).toBe(
      'clausulas do motor de cobranca ausentes: excess',
    );
  });

  it('recusa bloco de texto vazio, dizendo qual', () => {
    expect(
      contractProblem(ISSUER, {
        blocks: blocks([{ kind: 'paragraph', text: '   ' }]),
      }),
    ).toBe('blocks[5] (paragraph): text vazio');
  });

  it('recusa kind que o renderizador nao conhece', () => {
    expect(
      contractProblem(ISSUER, {
        blocks: [...blocks(), { kind: 'carimbo' } as unknown as ContractBlock],
      }),
    ).toBe('blocks[5] (carimbo): kind desconhecido');
  });

  it('recusa bloco de dados sem os rotulos', () => {
    expect(
      contractProblem(ISSUER, {
        blocks: blocks([
          { kind: 'items', columns: { quantity: 'Qtd' } } as ContractBlock,
        ]),
      }),
    ).toBe('blocks[5] (items): columns incompletos');
  });

  it('recusa emissor sem CNPJ', () => {
    const semCnpj = { ...ISSUER, taxId: undefined };

    expect(contractProblem(semCnpj, { blocks: blocks() })).toContain('issuer:');
  });

  it('recusa conteudo sem lista de blocos', () => {
    expect(contractProblem(ISSUER, {})).toBe('content.blocks: lista ausente');
  });
});

describe('modelo de relatorio', () => {
  const content = {
    billingNote: 'calculo pelas clausulas',
    signatures: { left: 'LOCADOR(A)', right: 'LOCATÁRIO(A)' },
  };

  it('aceita nota e assinaturas', () => {
    expect(reportProblem(ISSUER, content)).toBeNull();
  });

  it('recusa sem a nota de calculo', () => {
    expect(reportProblem(ISSUER, { signatures: content.signatures })).toBe(
      'content.billingNote: texto ausente',
    );
  });

  it('recusa assinatura sem os dois lados', () => {
    expect(
      reportProblem(ISSUER, {
        billingNote: content.billingNote,
        signatures: { left: 'LOCADOR(A)' },
      }),
    ).toBe('content.signatures: left e right');
  });
});
