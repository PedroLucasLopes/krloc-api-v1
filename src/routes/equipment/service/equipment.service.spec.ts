import { StatusEquipment } from 'generated/prisma/client';
import { PrismaService } from 'src/global/prisma/prisma.service';
import { EquipmentService } from './equipment.service';

interface Unidade {
  id: string;
  name: string;
  status: StatusEquipment;
}

interface Onde {
  id: string;
  status?: StatusEquipment;
}

/**
 * Prisma de mentira com uma unidade so. O `updateMany` respeita a situacao do
 * `where`, que e a trava do codigo contra duas escritas ao mesmo tempo, e o
 * `perdeACorrida` simula a outra escrita chegando primeiro.
 */
function fakePrisma(inicial: Unidade | null, perdeACorrida = false) {
  const unidade = inicial && { ...inicial };

  /** Como o Prisma grava: campo com `undefined` nao foi mandado, e nao muda nada. */
  const gravar = (data: Partial<Unidade>) => {
    for (const [campo, valor] of Object.entries(data)) {
      if (valor !== undefined) {
        (unidade as Record<string, unknown>)[campo] = valor;
      }
    }
  };

  const prisma = {
    equipment: {
      findUnique: () => Promise.resolve(unidade),

      update: ({ data }: { data: Partial<Unidade> }) => {
        gravar(data);
        return Promise.resolve(unidade);
      },

      updateMany: ({
        where,
        data,
      }: {
        where: Onde;
        data: Partial<Unidade>;
      }) => {
        if (
          perdeACorrida ||
          (where.status && unidade?.status !== where.status)
        ) {
          return Promise.resolve({ count: 0 });
        }

        gravar(data);
        return Promise.resolve({ count: 1 });
      },
    },
  };

  return {
    service: new EquipmentService(prisma as unknown as PrismaService),
    situacao: () => unidade?.status,
  };
}

const unidade = (status: StatusEquipment): Unidade => ({
  id: 'uma-unidade',
  name: 'Betoneira 400L',
  status,
});

describe('equipamento fora do contrato', () => {
  it.each([
    StatusEquipment.PENDING,
    StatusEquipment.LEASED,
    StatusEquipment.REPLACE,
  ])('nao se edita nem se desativa quando esta %s', async (status) => {
    const { service, situacao } = fakePrisma(unidade(status));

    await expect(
      service.editEquipment('uma-unidade', { name: 'outro' }),
    ).rejects.toMatchObject({
      code: 'equipment_leased',
    });
    await expect(service.deleteEquipment('uma-unidade')).rejects.toMatchObject({
      code: 'equipment_leased',
    });
    expect(situacao()).toBe(status);
  });

  it('edita e desativa o que esta disponivel', async () => {
    const { service, situacao } = fakePrisma(
      unidade(StatusEquipment.AVAILABLE),
    );

    await service.editEquipment('uma-unidade', { name: 'Betoneira 320L' });
    await service.deleteEquipment('uma-unidade');

    expect(situacao()).toBe(StatusEquipment.RETIRED);
  });

  it('id que nao existe responde com o codigo de nao encontrado', async () => {
    const { service } = fakePrisma(null);

    await expect(service.editEquipment('some', {})).rejects.toMatchObject({
      code: 'equipment_not_found',
    });
  });
});

/**
 * Desativado e baixa, nao um estado a mais do cadastro: a unidade so volta a
 * frota pela reativacao, e ela devolve disponivel.
 */
describe('reativacao', () => {
  it('devolve a unidade desativada a frota como disponivel', async () => {
    const { service, situacao } = fakePrisma(unidade(StatusEquipment.RETIRED));

    await service.reactivateEquipment('uma-unidade');

    expect(situacao()).toBe(StatusEquipment.AVAILABLE);
  });

  it('nao muda a situacao de quem nao esta desativado', async () => {
    for (const status of [
      StatusEquipment.AVAILABLE,
      StatusEquipment.MAINTENANCE,
      StatusEquipment.STOLEN,
      StatusEquipment.LEASED,
    ]) {
      const { service, situacao } = fakePrisma(unidade(status));

      await expect(
        service.reactivateEquipment('uma-unidade'),
      ).rejects.toMatchObject({
        code: 'equipment_not_retired',
      });
      expect(situacao()).toBe(status);
    }
  });

  it('id que nao existe responde com o codigo de nao encontrado', async () => {
    const { service } = fakePrisma(null);

    await expect(service.reactivateEquipment('some')).rejects.toMatchObject({
      code: 'equipment_not_found',
    });
  });

  it('de duas reativacoes ao mesmo tempo, so uma vale', async () => {
    const { service } = fakePrisma(unidade(StatusEquipment.RETIRED), true);

    await expect(
      service.reactivateEquipment('uma-unidade'),
    ).rejects.toMatchObject({
      code: 'equipment_not_retired',
    });
  });
});

/**
 * REGRESSAO. Editar sem mandar a situacao chegava ao `update` com `AVAILABLE`,
 * o padrao que o `PartialType` herdava do cadastro. Quem editasse o nome de uma
 * unidade em manutencao a deixava disponivel.
 */
describe('edicao sem situacao no corpo', () => {
  it('mantem a situacao gravada', async () => {
    const { service, situacao } = fakePrisma(
      unidade(StatusEquipment.MAINTENANCE),
    );

    await service.editEquipment('uma-unidade', { name: 'Betoneira 320L' });

    expect(situacao()).toBe(StatusEquipment.MAINTENANCE);
  });
});
