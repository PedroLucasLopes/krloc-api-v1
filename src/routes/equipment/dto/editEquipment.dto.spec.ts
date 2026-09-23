import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEquipmentDto } from './createEquipment.dto';
import { EditEquipmentDto } from './editEquipment.dto';

/** A mesma configuracao do ValidationPipe de `main.ts`. */
const instancia = <T>(dto: new () => T, body: Record<string, unknown>): T =>
  plainToInstance(dto, body);

const recusas = async (instance: object) => {
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  return errors.map((error) => error.property);
};

const cadastro = {
  name: 'Betoneira 400L',
  code: 'KRB',
  p_diary: 90,
  p_indemnity: 3500,
};

describe('cadastro de equipamento', () => {
  it('aceita sem situacao, e a unidade nasce disponivel pelo padrao da coluna', async () => {
    const dto = instancia(CreateEquipmentDto, cadastro);

    expect(await recusas(dto)).toEqual([]);
    expect(dto.status).toBeUndefined();
  });

  it('aceita as tres situacoes do cadastro', async () => {
    for (const status of ['AVAILABLE', 'MAINTENANCE', 'STOLEN']) {
      expect(
        await recusas(instancia(CreateEquipmentDto, { ...cadastro, status })),
      ).toEqual([]);
    }
  });

  it('recusa situacao que e do contrato, e a de desativado', async () => {
    for (const status of ['PENDING', 'LEASED', 'REPLACE', 'RETIRED']) {
      expect(
        await recusas(instancia(CreateEquipmentDto, { ...cadastro, status })),
      ).toEqual(['status']);
    }
  });
});

/**
 * REGRESSAO. O `PartialType` herda os inicializadores da classe de origem, e o
 * `ValidationPipe` roda com `transform: true`: com `status = AVAILABLE` no
 * cadastro, toda edicao que nao mandasse a situacao chegava ao `update` com
 * `AVAILABLE`. Mexer no nome de uma unidade em manutencao a deixava disponivel,
 * e uma desativada voltava calada a frota, sem passar pela reativacao.
 */
describe('edicao de equipamento', () => {
  it('sem situacao no corpo, nao inventa uma', async () => {
    const dto = instancia(EditEquipmentDto, { name: 'Betoneira 400L' });

    expect(await recusas(dto)).toEqual([]);
    // Sem valor, a situacao nao chega ao `update`: o Prisma ignora `undefined`.
    expect(dto.status).toBeUndefined();
  });

  it('aceita a situacao que o cadastro grava', async () => {
    const dto = instancia(EditEquipmentDto, { status: 'MAINTENANCE' });

    expect(await recusas(dto)).toEqual([]);
    expect(dto.status).toBe('MAINTENANCE');
  });

  it('recusa desativado pelo corpo: quem tira do desativado e a reativacao', async () => {
    expect(
      await recusas(instancia(EditEquipmentDto, { status: 'RETIRED' })),
    ).toEqual(['status']);
  });
});
