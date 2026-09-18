import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateClientDto } from 'src/routes/client/dto/createClient.dto';
import { CreateELeaseDto } from 'src/routes/elease/dto/createELease.dto';
import { FieldError, validationException } from './validationError';

/** O que o ValidationPipe global faria com o corpo, sem subir a aplicacao. */
async function recusa(
  dto: new () => object,
  corpo: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const erros = await validate(plainToInstance(dto, corpo), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const excecao = validationException(erros);

  return {
    status: excecao.getStatus(),
    body: excecao.getResponse() as Record<string, unknown>,
  };
}

const cliente = {
  name: 'Cliente',
  tax_id: '11222333000181',
  address: 'Rua A',
  zipcode: '01001000',
};

/**
 * A recusa da validacao e o contrato que o front traduz: `validation_failed`
 * com o codigo de cada campo. O front nunca mostra o texto do class-validator,
 * entao o codigo tem de vir da regra, pelo `context` do DTO.
 */
describe('validationException', () => {
  it('regra com codigo no DTO manda o codigo do campo', async () => {
    const { status, body } = await recusa(CreateClientDto, {
      ...cliente,
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
    const { body } = await recusa(CreateClientDto, { ...cliente, name: 42 });

    expect(body.fields).toContainEqual(
      expect.objectContaining({ field: 'name', error: 'invalid_value' }),
    );
  });

  it('campo que o DTO nao declara e recusado, sem repetir o valor', async () => {
    const { body } = await recusa(CreateClientDto, {
      ...cliente,
      extra: '<script>alert(1)</script>',
    });

    expect(body.fields).toContainEqual(
      expect.objectContaining({ field: 'extra', error: 'invalid_value' }),
    );
    expect(JSON.stringify(body)).not.toContain('<script>');
  });

  it('a data final antes da inicial sai end_before_start', async () => {
    const { body } = await recusa(CreateELeaseDto, {
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
