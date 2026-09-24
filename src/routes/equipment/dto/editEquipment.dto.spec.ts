import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEquipmentDto } from './createEquipment.dto';
import { EditEquipmentDto } from './editEquipment.dto';

const toInstance = <T>(dto: new () => T, body: Record<string, unknown>): T =>
  plainToInstance(dto, body);

const refusals = async (instance: object) => {
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  return errors.map((error) => error.property);
};

const registration = {
  name: 'Betoneira 400L',
  code: 'KRB',
  p_diary: 90,
  p_indemnity: 3500,
};

describe('cadastro de equipamento', () => {
  it('aceita sem situacao, e a unidade nasce disponivel pelo padrao da coluna', async () => {
    const dto = toInstance(CreateEquipmentDto, registration);

    expect(await refusals(dto)).toEqual([]);
    expect(dto.status).toBeUndefined();
  });

  it('aceita as tres situacoes do cadastro', async () => {
    for (const status of ['AVAILABLE', 'MAINTENANCE', 'STOLEN']) {
      expect(
        await refusals(
          toInstance(CreateEquipmentDto, { ...registration, status }),
        ),
      ).toEqual([]);
    }
  });

  it('recusa situacao que e do contrato, e a de desativado', async () => {
    for (const status of ['PENDING', 'LEASED', 'REPLACE', 'RETIRED']) {
      expect(
        await refusals(
          toInstance(CreateEquipmentDto, { ...registration, status }),
        ),
      ).toEqual(['status']);
    }
  });
});

describe('edicao de equipamento', () => {
  it('sem situacao no corpo, nao inventa uma', async () => {
    const dto = toInstance(EditEquipmentDto, { name: 'Betoneira 400L' });

    expect(await refusals(dto)).toEqual([]);
    expect(dto.status).toBeUndefined();
  });

  it('aceita a situacao que o cadastro grava', async () => {
    const dto = toInstance(EditEquipmentDto, { status: 'MAINTENANCE' });

    expect(await refusals(dto)).toEqual([]);
    expect(dto.status).toBe('MAINTENANCE');
  });

  it('recusa desativado pelo corpo: quem tira do desativado e a reativacao', async () => {
    expect(
      await refusals(toInstance(EditEquipmentDto, { status: 'RETIRED' })),
    ).toEqual(['status']);
  });
});
