import { calendarDays, monthRange } from './calendar';
import { cheapestCover, PriceTable } from './packages';
import { chargePosition, PositionUnit, quotePosition } from './rules';
import { BillingItem, buildStatement } from './statement';

const MIXER: PriceTable = {
  daily: 1_000,
  weekly: 5_000,
  biweekly: 8_000,
  monthly: 10_000,
  indemnity: 500_000,
};

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

const always = (): PriceTable => MIXER;

const charge = (
  plannedDays: number,
  units: PositionUnit[],
  asOf: Date = day(0),
  priceAt: (equipmentId: string, at: Date) => PriceTable = always,
) =>
  chargePosition({
    plannedDays,
    contractPrices: MIXER,
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
    const night = new Date(Date.UTC(2026, 8, 1, 2, 30));

    expect(calendarDays(night, day(0))).toBe(1);
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
    expect(cheapestCover(MIXER, 7)).toMatchObject({ amount: 5_000 });
  });

  it('dez dias: 1 semanal + 3 diarias, e nao a quinzena de mesmo preco', () => {
    const cover = cheapestCover(MIXER, 10);

    expect(cover.amount).toBe(8_000);
    expect(cover.packages.map((p) => [p.kind, p.count])).toEqual([
      ['weekly', 1],
      ['daily', 3],
    ]);
  });

  it('vinte e dois dias: o mes, que cobre mais e custa menos', () => {
    expect(cheapestCover(MIXER, 22)).toMatchObject({
      amount: 10_000,
      coveredDays: 30,
    });
  });

  it('pacote sem preco fica de fora', () => {
    const dailyOnly: PriceTable = {
      ...MIXER,
      weekly: null,
      biweekly: null,
      monthly: null,
    };

    expect(cheapestCover(dailyOnly, 10).amount).toBe(10_000);
  });
});

describe('cobranca pelas clausulas do contrato', () => {
  it('o exemplo do Pedro: diaria prorrogada 14 vezes da R$ 150', () => {
    const billing = charge(1, [
      unit({ end: day(15), finalStatus: 'AVAILABLE' }),
    ]);

    expect(billing.days).toBe(15);
    expect(billing.lines.filter((l) => l.kind === 'renewal')).toEqual([
      expect.objectContaining({ index: 1, count: 14, amount: 14_000 }),
    ]);
    expect(billing.total).toBe(15_000);
  });

  it('prorrogacoes de mesmo preco viram uma linha; tabela nova abre outra', () => {
    const increase = (_: string, at: Date): PriceTable =>
      at.getTime() >= day(9).getTime() ? { ...MIXER, daily: 1_200 } : MIXER;
    const billing = charge(
      1,
      [unit({ end: day(20), finalStatus: 'AVAILABLE' })],
      day(0),
      increase,
    );

    expect(
      billing.lines.map((l) =>
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
    const billing = charge(15, [
      unit({ end: day(5), finalStatus: 'AVAILABLE' }),
    ]);

    expect(billing.lines).toEqual([
      expect.objectContaining({ kind: 'usage', days: 5, amount: 5_000 }),
    ]);
    expect(billing.contracted).toBe(8_000);
    expect(billing.total).toBe(5_000);
  });

  it('semana devolvida com 1 dia: uma diaria', () => {
    expect(
      charge(7, [unit({ end: day(1), finalStatus: 'AVAILABLE' })]).total,
    ).toBe(1_000);
  });

  it('quinzena devolvida com 12 dias: a quinzena sai mais barata que o uso a varejo', () => {
    const billing = charge(15, [
      unit({ end: day(12), finalStatus: 'AVAILABLE' }),
    ]);

    expect(billing.lines).toEqual([
      expect.objectContaining({ kind: 'usage', days: 12, amount: 8_000 }),
    ]);
  });

  it('quinzena devolvida no ultimo dia: o contratado', () => {
    expect(
      charge(15, [unit({ end: day(15), finalStatus: 'AVAILABLE' })]).lines,
    ).toEqual([
      expect.objectContaining({ kind: 'contracted', days: 15, amount: 8_000 }),
    ]);
  });

  it('quinzena devolvida em 22 dias: contratado + 7 dias a 10% do mensal', () => {
    const billing = charge(15, [
      unit({ end: day(22), finalStatus: 'AVAILABLE' }),
    ]);

    expect(billing.lines.map((l) => [l.kind, l.amount])).toEqual([
      ['contracted', 8_000],
      ['excess', 7_000],
    ]);
    expect(billing.total).toBe(15_000);
  });

  it('quinzena devolvida em 40 dias: uma prorrogacao completa e 10 dias excedentes', () => {
    const billing = charge(15, [
      unit({ end: day(40), finalStatus: 'AVAILABLE' }),
    ]);

    expect(billing.lines.map((l) => [l.kind, l.amount])).toEqual([
      ['contracted', 8_000],
      ['renewal', 8_000],
      ['excess', 10_000],
    ]);
  });

  it('a prorrogacao usa a tabela em vigor no dia em que ela comecou', () => {
    const increase = (_: string, at: Date): PriceTable =>
      at.getTime() >= day(14).getTime() ? { ...MIXER, biweekly: 9_000 } : MIXER;
    const billing = charge(
      15,
      [unit({ end: day(30), finalStatus: 'AVAILABLE' })],
      day(0),
      increase,
    );

    expect(billing.lines.map((l) => [l.kind, l.amount])).toEqual([
      ['contracted', 8_000],
      ['renewal', 9_000],
    ]);
  });

  it('o dia excedente usa o valor mensal atual, na devolucao', () => {
    const increase = (_: string, at: Date): PriceTable =>
      at.getTime() >= day(20).getTime() ? { ...MIXER, monthly: 12_000 } : MIXER;
    const billing = charge(
      15,
      [unit({ end: day(22), finalStatus: 'AVAILABLE' })],
      day(0),
      increase,
    );

    expect(billing.lines[1]).toMatchObject({
      kind: 'excess',
      days: 7,
      dailyRate: 1_200,
      amount: 8_400,
    });
  });

  it('sem mensal na tabela, o dia excedente sai pela diaria', () => {
    const noMonthly = (): PriceTable => ({ ...MIXER, monthly: null });
    const billing = charge(
      15,
      [unit({ end: day(17), finalStatus: 'AVAILABLE' })],
      day(0),
      noMonthly,
    );

    expect(billing.lines[1]).toMatchObject({
      kind: 'excess',
      days: 2,
      dailyRate: 1_000,
    });
  });

  it('defeito sem substituto: so o uso ate o dia (10 dias = semana + 3 diarias)', () => {
    const billing = charge(15, [
      unit({ end: day(10), finalStatus: 'MAINTENANCE' }),
    ]);

    expect(billing.end).toBe('defect');
    expect(billing.lines).toEqual([
      expect.objectContaining({ kind: 'usage', days: 10, amount: 8_000 }),
    ]);
  });

  it('defeito com substituto: a posicao e um aluguel so, do inicio do original a volta do substituto', () => {
    const billing = charge(15, [
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

    expect(billing.days).toBe(15);
    expect(billing.total).toBe(8_000);
  });

  it('roubo sem substituto: uso ate o roubo mais a indenizacao', () => {
    const billing = charge(15, [unit({ end: day(10), finalStatus: 'STOLEN' })]);

    expect(billing.rental).toBe(8_000);
    expect(billing.indemnity).toBe(500_000);
  });

  it('roubo com substituto devolvido atrasado: a posicao segue o contrato, mais a indenizacao', () => {
    const billing = charge(15, [
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

    expect(billing.rental).toBe(15_000);
    expect(billing.indemnity).toBe(500_000);
  });

  it('ainda na obra: conta o uso ate hoje, e depois do prazo corre o excedente', () => {
    expect(charge(15, [unit()], day(5)).total).toBe(5_000);
    expect(charge(15, [unit()], day(20)).total).toBe(13_000);
  });

  it('contrato pendente: o periodo contratado inteiro', () => {
    const quote = quotePosition({
      plannedDays: 15,
      contractPrices: MIXER,
      start: day(0),
      end: day(15),
    });

    expect(quote.lines).toEqual([
      expect.objectContaining({ kind: 'contracted', days: 15, amount: 8_000 }),
    ]);
    expect(quote.total).toBe(8_000);
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

  const contract = (status: string, finishDate: Date | null = null) => ({
    id: 'contrato-1',
    status,
    startDate: day(0),
    endDate: day(7),
    finishDate,
  });

  it('cada equipamento corre ate a propria devolucao', () => {
    const statement = buildStatement({
      contract: contract('COMPLETED', day(7)),
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
      priceAt: always,
    });

    expect(statement.positions.map((p) => p.charge.total)).toEqual([
      1_000, 5_000,
    ]);
    expect(statement.totals).toMatchObject({
      contracted: 10_000,
      total: 6_000,
    });
  });

  it('recusa periodo alem do teto, em vez de travar o processo calculando', () => {
    const absurd = {
      ...contract('ACTIVE'),
      endDate: new Date('9999-12-31T15:00:00Z'),
    };

    let refusal: unknown;

    try {
      buildStatement({
        contract: absurd,
        items: [item({})],
        asOf: day(0),
        indemnityDate: day(0),
        priceAt: always,
      });
    } catch (error) {
      refusal = error;
    }

    expect(refusal).toMatchObject({ code: 'period_too_long' });
  });

  it('pendente: o contratado, sem uso a contar', () => {
    const statement = buildStatement({
      contract: contract('PENDING'),
      items: [item({})],
      asOf: day(0),
      indemnityDate: day(0),
      priceAt: always,
    });

    expect(statement.totals).toMatchObject({ contracted: 5_000, total: 5_000 });
  });
});
