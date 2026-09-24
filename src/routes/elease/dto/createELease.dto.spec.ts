import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateELeaseDto } from './createELease.dto';

const refusals = async (body: Record<string, unknown>) => {
  const errors = await validate(plainToInstance(CreateELeaseDto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  return errors.flatMap((error) => [
    error.property,
    ...Object.keys(error.contexts ?? {}).map(
      (rule) =>
        (error.contexts?.[rule] as { code?: string } | undefined)?.code ?? rule,
    ),
  ]);
};

const valid = {
  lesseeId: 'obra-1',
  startDate: '2026-09-01T15:00:00.000Z',
  endDate: '2026-09-16T15:00:00.000Z',
  equipments: ['3f5c6a1e-0b1d-4c8e-9a4b-2d7e8f9a0b1c'],
};

describe('contrato novo', () => {
  it('aceita um contrato de quinzena', async () => {
    expect(await refusals(valid)).toEqual([]);
  });

  it('recusa situacao e data de fechamento vindas do corpo', async () => {
    const fields = await refusals({
      ...valid,
      status: 'COMPLETED',
      finishDate: '2026-09-02T15:00:00.000Z',
    });

    expect(fields).toEqual(expect.arrayContaining(['status', 'finishDate']));
  });

  it('recusa termino no ano 9999: a conta percorreria milhoes de dias', async () => {
    const fields = await refusals({
      ...valid,
      endDate: '9999-12-31T15:00:00.000Z',
    });

    expect(fields).toEqual(
      expect.arrayContaining([
        'endDate',
        'date_out_of_range',
        'period_too_long',
      ]),
    );
  });

  it('recusa periodo contratado acima de cinco anos', async () => {
    const fields = await refusals({
      ...valid,
      endDate: '2032-01-01T15:00:00.000Z',
    });

    expect(fields).toEqual(['endDate', 'period_too_long']);
  });
});
