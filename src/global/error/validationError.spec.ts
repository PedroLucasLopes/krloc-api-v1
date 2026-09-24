import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateClientDto } from 'src/routes/client/dto/createClient.dto';
import { CreateELeaseDto } from 'src/routes/elease/dto/createELease.dto';
import { FieldError, validationException } from './validationError';

async function refusal(
  dto: new () => object,
  payload: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const errors = await validate(plainToInstance(dto, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const exception = validationException(errors);

  return {
    status: exception.getStatus(),
    body: exception.getResponse() as Record<string, unknown>,
  };
}

const client = {
  name: 'Cliente',
  tax_id: '11222333000181',
  address: 'Rua A',
  zipcode: '01001000',
};

describe('validationException', () => {
  it('regra com codigo no DTO manda o codigo do campo', async () => {
    const { status, body } = await refusal(CreateClientDto, {
      ...client,
      phone: '123',
    });
    const fields = body.fields as FieldError[];

    expect(status).toBe(400);
    expect(body.error).toBe('validation_failed');
    expect(fields).toContainEqual(
      expect.objectContaining({ field: 'phone', error: 'phone_invalid' }),
    );
  });

  it('regra sem codigo sai invalid_value', async () => {
    const { body } = await refusal(CreateClientDto, { ...client, name: 42 });

    expect(body.fields).toContainEqual(
      expect.objectContaining({ field: 'name', error: 'invalid_value' }),
    );
  });

  it('campo que o DTO nao declara e recusado, sem repetir o valor', async () => {
    const { body } = await refusal(CreateClientDto, {
      ...client,
      extra: '<script>alert(1)</script>',
    });

    expect(body.fields).toContainEqual(
      expect.objectContaining({ field: 'extra', error: 'invalid_value' }),
    );
    expect(JSON.stringify(body)).not.toContain('<script>');
  });

  it('a data final antes da inicial sai end_before_start', async () => {
    const { body } = await refusal(CreateELeaseDto, {
      lesseeId: '9f1c1e8e-3a4b-4c5d-8e9f-0a1b2c3d4e5f',
      equipments: ['9f1c1e8e-3a4b-4c5d-8e9f-0a1b2c3d4e5f'],
      startDate: '2026-09-10T12:00:00.000Z',
      endDate: '2026-09-01T12:00:00.000Z',
    });

    expect(body.fields).toContainEqual(
      expect.objectContaining({ field: 'endDate', error: 'end_before_start' }),
    );
  });
});
