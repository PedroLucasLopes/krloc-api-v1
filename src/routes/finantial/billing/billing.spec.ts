import { calendarDays, monthRange } from './calendar';
import { cheapestCover, PriceTable } from './packages';
import { chargePosition, PositionUnit, quotePosition } from './rules';
import { BillingItem, buildStatement } from './statement';

/** A betoneira dos exemplos: diaria 10, semana 50, quinzena 80, mes 100, indenizacao 5.000. */
const BETONEIRA: PriceTable = {
  daily: 1_000,
  weekly: 5_000,
  biweekly: 8_000,
  monthly: 10_000,
  indemnity: 500_000,
};

/** Meio-dia em Sao Paulo, `n` dias depois de 1o de setembro de 2026. */
const day = (n: number): Date => new Date(Date.UTC(2026, 8, 1 + n, 15, 0, 0));

const unit = (overrides: Partial<PositionUnit> = {}): PositionUnit => ({
  itemId: 'item-1',
  equipmentId: 'betoneira-1',
  code: 'KRBT-1',
  name: 'Betoneira',
  start: day(0),
  end: null,
  finalStatus: null,
  ...overrides,
});

/** A mesma tabela em qualquer data, salvo quando o teste troca o preco. */
const sempre = (): PriceTable => BETONEIRA;

const cobrar = (
  plannedDays: number,
  units: PositionUnit[],
  asOf: Date = day(0),
  priceAt: (equipmentId: string, at: Date) => PriceTable = sempre,
) =>
  chargePosition({
    plannedDays,
    contractPrices: BETONEIRA,
    units,
    asOf,
    indemnityDate: asOf,
    priceAt,
  });

describe('calendario', () => {
  it('conta dias corridos da retirada a devolucao', () => {
    expect(calendarDays(day(0), day(15))).toBe(15);
  });

  it('usa o dia de Sao Paulo, nao o do UTC', () => {
    // 23h30 de 31/08 em Sao Paulo ja e 1o de setembro no UTC.
    const noite = new Date(Date.UTC(2026, 8, 1, 2, 30));

    expect(calendarDays(noite, day(0))).toBe(1);
  });

  it('cobra ao menos uma diaria, mesmo com volta no mesmo dia', () => {
    expect(calendarDays(day(3), day(3))).toBe(1);
    expect(calendarDays(day(3), day(1))).toBe(1);
  });

  it('o mes vai da meia-noite do dia 1 a meia-noite do mes seguinte, em Sao Paulo', () => {
    expect(monthRange('2026-09')).toEqual({
      from: new Date('2026-09-01T03:00:00.000Z'),
      to: new Date('2026-10-01T03:00:00.000Z'),
    });
  });
});

describe('combinacao mais barata de pacotes', () => {
  it('sete diarias custam mais que a semana: cobra a semana', () => {
    expect(cheapestCover(BETONEIRA, 7)).toMatchObject({ amount: 5_000 });
  });

  it('dez dias: 1 semanal + 3 diarias, e nao a quinzena de mesmo preco', () => {
    const cover = cheapestCover(BETONEIRA, 10);

    expect(cover.amount).toBe(8_000);
    expect(cover.packages.map((p) => [p.kind, p.count])).toEqual([
      ['weekly', 1],
      ['daily', 3],
    ]);
  });

  it('vinte e dois dias: o mes, que cobre mais e custa menos', () => {
    expect(cheapestCover(BETONEIRA, 22)).toMatchObject({
      amount: 10_000,
      coveredDays: 30,
    });
  });

  it('pacote sem preco fica de fora', () => {
    const soDiaria: PriceTable = {
      ...BETONEIRA,
      weekly: null,
      biweekly: null,
      monthly: null,
    };

    expect(cheapestCover(soDiaria, 10).amount).toBe(10_000);
  });
});

describe('cobranca pelas clausulas do contrato', () => {
  it('o exemplo do Pedro: diaria prorrogada 14 vezes da R$ 150', () => {
    const cobranca = cobrar(1, [
      unit({ end: day(15), finalStatus: 'AVAILABLE' }),
    ]);

    expect(cobranca.days).toBe(15);
    expect(cobranca.lines.filter((l) => l.kind === 'renewal')).toEqual([
      expect.objectContaining({ index: 1, count: 14, amount: 14_000 }),
    ]);
    expect(cobranca.total).toBe(15_000);
  });

  it('prorrogacoes de mesmo preco viram uma linha; tabela nova abre outra', () => {
    // A prorrogacao 10 comeca a meia-noite do dia 10: a tabela nova vale desde o dia 9.
    const aumento = (_: string, at: Date): PriceTable =>
      at.getTime() >= day(9).getTime()
        ? { ...BETONEIRA, daily: 1_200 }
        : BETONEIRA;
    const cobranca = cobrar(
      1,
      [unit({ end: day(20), finalStatus: 'AVAILABLE' })],
      day(0),
      aumento,
    );

    expect(
      cobranca.lines.map((l) =>
        l.kind === 'renewal'
          ? [l.kind, l.index, l.count, l.amount]
          : [l.kind, l.amount],
      ),
    ).toEqual([
      ['contracted', 1_000],
      ['renewal', 1, 9, 9_000],
      ['renewal', 10, 10, 12_000],
    ]);
  });

  it('quinzena devolvida em 5 dias: cobra o uso, 5 diarias, e nao a quinzena', () => {
    const cobranca = cobrar(15, [
      unit({ end: day(5), finalStatus: 'AVAILABLE' }),
    ]);

    expect(cobranca.lines).toEqual([
      expect.objectContaining({ kind: 'usage', days: 5, amount: 5_000 }),
    ]);
    expect(cobranca.contracted).toBe(8_000);
    expect(cobranca.total).toBe(5_000);
  });

  it('semana devolvida com 1 dia: uma diaria', () => {
    expect(
      cobrar(7, [unit({ end: day(1), finalStatus: 'AVAILABLE' })]).total,
    ).toBe(1_000);
  });

  it('quinzena devolvida com 12 dias: a quinzena sai mais barata que o uso a varejo', () => {
    const cobranca = cobrar(15, [
      unit({ end: day(12), finalStatus: 'AVAILABLE' }),
    ]);

    expect(cobranca.lines).toEqual([
      expect.objectContaining({ kind: 'usage', days: 12, amount: 8_000 }),
    ]);
  });

  it('quinzena devolvida no ultimo dia: o contratado', () => {
    expect(
      cobrar(15, [unit({ end: day(15), finalStatus: 'AVAILABLE' })]).lines,
    ).toEqual([
      expect.objectContaining({ kind: 'contracted', days: 15, amount: 8_000 }),
    ]);
  });

  it('quinzena devolvida em 22 dias: contratado + 7 dias a 10% do mensal', () => {
    const cobranca = cobrar(15, [
      unit({ end: day(22), finalStatus: 'AVAILABLE' }),
    ]);

    expect(cobranca.lines.map((l) => [l.kind, l.amount])).toEqual([
      ['contracted', 8_000],
      ['excess', 7_000],
    ]);
    expect(cobranca.total).toBe(15_000);
  });

  it('quinzena devolvida em 40 dias: uma prorrogacao completa e 10 dias excedentes', () => {
    const cobranca = cobrar(15, [
      unit({ end: day(40), finalStatus: 'AVAILABLE' }),
    ]);

    expect(cobranca.lines.map((l) => [l.kind, l.amount])).toEqual([
      ['contracted', 8_000],
      ['renewal', 8_000],
      ['excess', 10_000],
    ]);
  });

  it('a prorrogacao usa a tabela em vigor no dia em que ela comecou', () => {
    const aumento = (_: string, at: Date): PriceTable =>
      at.getTime() >= day(14).getTime()
        ? { ...BETONEIRA, biweekly: 9_000 }
        : BETONEIRA;
    const cobranca = cobrar(
      15,
      [unit({ end: day(30), finalStatus: 'AVAILABLE' })],
      day(0),
      aumento,
    );

    expect(cobranca.lines.map((l) => [l.kind, l.amount])).toEqual([
      ['contracted', 8_000],
      ['renewal', 9_000],
    ]);
  });

  it('o dia excedente usa o valor mensal atual, na devolucao', () => {
    const aumento = (_: string, at: Date): PriceTable =>
      at.getTime() >= day(20).getTime()
        ? { ...BETONEIRA, monthly: 12_000 }
        : BETONEIRA;
    const cobranca = cobrar(
      15,
      [unit({ end: day(22), finalStatus: 'AVAILABLE' })],
      day(0),
      aumento,
    );

    expect(cobranca.lines[1]).toMatchObject({
      kind: 'excess',
      days: 7,
      dailyRate: 1_200,
      amount: 8_400,
    });
  });

  it('sem mensal na tabela, o dia excedente sai pela diaria', () => {
    const semMensal = (): PriceTable => ({ ...BETONEIRA, monthly: null });
    const cobranca = cobrar(
      15,
      [unit({ end: day(17), finalStatus: 'AVAILABLE' })],
      day(0),
      semMensal,
    );

    expect(cobranca.lines[1]).toMatchObject({
      kind: 'excess',
      days: 2,
      dailyRate: 1_000,
    });
  });

  it('defeito sem substituto: so o uso ate o dia (10 dias = semana + 3 diarias)', () => {
    const cobranca = cobrar(15, [
      unit({ end: day(10), finalStatus: 'MAINTENANCE' }),
    ]);

    expect(cobranca.end).toBe('defect');
    expect(cobranca.lines).toEqual([
      expect.objectContaining({ kind: 'usage', days: 10, amount: 8_000 }),
    ]);
  });

  it('defeito com substituto: a posicao e um aluguel so, do inicio do original a volta do substituto', () => {
    const cobranca = cobrar(15, [
      unit({ end: day(10), finalStatus: 'MAINTENANCE' }),
      unit({
        itemId: 'item-2',
        equipmentId: 'betoneira-2',
        code: 'KRBT-2',
        start: day(10),
        end: day(15),
        finalStatus: 'AVAILABLE',
      }),
    ]);

    expect(cobranca.days).toBe(15);
    expect(cobranca.total).toBe(8_000);
  });

  it('roubo sem substituto: uso ate o roubo mais a indenizacao', () => {
    const cobranca = cobrar(15, [
      unit({ end: day(10), finalStatus: 'STOLEN' }),
    ]);

    expect(cobranca.rental).toBe(8_000);
    expect(cobranca.indemnity).toBe(500_000);
  });

  it('roubo com substituto devolvido atrasado: a posicao segue o contrato, mais a indenizacao', () => {
    const cobranca = cobrar(15, [
      unit({ end: day(10), finalStatus: 'STOLEN' }),
      unit({
        itemId: 'item-2',
        equipmentId: 'betoneira-2',
        code: 'KRBT-2',
        start: day(10),
        end: day(22),
        finalStatus: 'AVAILABLE',
      }),
    ]);

    expect(cobranca.rental).toBe(15_000);
    expect(cobranca.indemnity).toBe(500_000);
  });

  it('ainda na obra: conta o uso ate hoje, e depois do prazo corre o excedente', () => {
    expect(cobrar(15, [unit()], day(5)).total).toBe(5_000);
    expect(cobrar(15, [unit()], day(20)).total).toBe(13_000);
  });

  it('contrato pendente: o periodo contratado inteiro', () => {
    const orcamento = quotePosition({
      plannedDays: 15,
      contractPrices: BETONEIRA,
      start: day(0),
      end: day(15),
    });

    expect(orcamento.lines).toEqual([
      expect.objectContaining({ kind: 'contracted', days: 15, amount: 8_000 }),
    ]);
    expect(orcamento.total).toBe(8_000);
  });
});

describe('extrato do contrato', () => {
  const item = (overrides: Partial<BillingItem>): BillingItem => ({
    id: 'item-1',
    equipmentId: 'betoneira-1',
    equipmentName: 'Betoneira',
    equipmentCode: 'KRBT',
    equipmentSuffix: 1,
    p_diary: 10,
    p_weekly: 50,
    p_biweekly: 80,
    p_monthly: 100,
    p_indemnity: 5_000,
    startDate: day(0),
    finishDate: null,
    startStatus: 'LEASED',
    finalStatus: null,
    replacesItemId: null,
    ...overrides,
  });

  const contrato = (status: string, finishDate: Date | null = null) => ({
    id: 'contrato-1',
    status,
    startDate: day(0),
    endDate: day(7),
    finishDate,
  });

  it('cada equipamento corre ate a propria devolucao', () => {
    const extrato = buildStatement({
      contract: contrato('COMPLETED', day(7)),
      items: [
        item({ finishDate: day(1), finalStatus: 'AVAILABLE' }),
        item({
          id: 'item-2',
          equipmentId: 'betoneira-2',
          equipmentSuffix: 2,
          finishDate: day(7),
          finalStatus: 'AVAILABLE',
        }),
      ],
      asOf: day(7),
      indemnityDate: day(7),
      priceAt: sempre,
    });

    expect(extrato.positions.map((p) => p.charge.total)).toEqual([
      1_000, 5_000,
    ]);
    expect(extrato.totals).toMatchObject({ contracted: 10_000, total: 6_000 });
  });

  it('recusa periodo alem do teto, em vez de travar o processo calculando', () => {
    const absurdo = {
      ...contrato('ACTIVE'),
      endDate: new Date('9999-12-31T15:00:00Z'),
    };

    let recusa: unknown;

    try {
      buildStatement({
        contract: absurdo,
        items: [item({})],
        asOf: day(0),
        indemnityDate: day(0),
        priceAt: sempre,
      });
    } catch (error) {
      recusa = error;
    }

    expect(recusa).toMatchObject({ code: 'period_too_long' });
  });

  it('pendente: o contratado, sem uso a contar', () => {
    const extrato = buildStatement({
      contract: contrato('PENDING'),
      items: [item({})],
      asOf: day(0),
      indemnityDate: day(0),
      priceAt: sempre,
    });

    expect(extrato.totals).toMatchObject({ contracted: 5_000, total: 5_000 });
  });
});
