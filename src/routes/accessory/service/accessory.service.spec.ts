import { StatusEquipment } from 'generated/prisma/client';
import { PrismaService } from 'src/global/prisma/prisma.service';
import { AccessoryService } from './accessory.service';

interface Estoque {
  id: string;
  quantity: number;
}

const UNIDADE = '0f2a8b3c-1d4e-4f6a-8b9c-0d1e2f3a4b5c';
const CINTA = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const MANGUEIRA = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';

/**
 * Prisma de mentira com uma unidade e um estoque de acessorios. O `updateMany`
 * so tira unidade de quem ainda tem, que e a trava do codigo contra duas
 * associacoes levando a mesma ultima unidade.
 */
function fakePrisma(status: StatusEquipment | null, estoque: Estoque[]) {
  const acessorios = estoque.map((item) => ({ ...item }));
  const associacoes: { equipmentId: string; accessoryId: string }[] = [];

  const tx = {
    accessory: {
      updateMany: ({ where }: { where: { id: { in: string[] } } }) => {
        const alcancados = acessorios.filter(
          (item) => where.id.in.includes(item.id) && item.quantity > 0,
        );

        for (const item of alcancados) item.quantity -= 1;

        return Promise.resolve({ count: alcancados.length });
      },
    },
    equipmentAccessory: {
      createMany: ({
        data,
      }: {
        data: { equipmentId: string; accessoryId: string }[];
      }) => {
        associacoes.push(...data);
        return Promise.resolve({ count: data.length });
      },
    },
  };

  const prisma = {
    equipment: {
      findUnique: () => Promise.resolve(status && { id: UNIDADE, status }),
    },
    accessory: {
      findMany: ({
        where,
      }: {
        where: { id: { in: string[] }; quantity: { gt: number } };
      }) =>
        Promise.resolve(
          acessorios.filter(
            (item) => where.id.in.includes(item.id) && item.quantity > 0,
          ),
        ),
    },
    $transaction: <T>(fn: (cliente: typeof tx) => Promise<T>) => fn(tx),
  };

  return {
    service: new AccessoryService(prisma as unknown as PrismaService),
    acessorios,
    associacoes,
  };
}

/**
 * REGRESSAO. A conferencia de "so unidade disponivel" vivia no `where` de um
 * `findMany`, e o retorno dele e sempre um array: `if (!equipment)` nunca era
 * verdade. Acessorio entrava em unidade reservada, locada ou desativada, e saia
 * para a obra sem estar em contrato nenhum.
 */
describe('associar acessorio a equipamento', () => {
  it.each([
    StatusEquipment.PENDING,
    StatusEquipment.LEASED,
    StatusEquipment.REPLACE,
    StatusEquipment.MAINTENANCE,
    StatusEquipment.STOLEN,
    StatusEquipment.RETIRED,
  ])('recusa unidade %s, e o estoque nao se mexe', async (status) => {
    const { service, acessorios, associacoes } = fakePrisma(status, [
      { id: CINTA, quantity: 3 },
    ]);

    await expect(
      service.associateEquipmentsToAccessory({
        equipmentId: UNIDADE,
        accessoryIds: [CINTA],
      }),
    ).rejects.toMatchObject({ code: 'equipment_unavailable' });

    expect(acessorios[0].quantity).toBe(3);
    expect(associacoes).toHaveLength(0);
  });

  it('recusa unidade que nao existe', async () => {
    const { service } = fakePrisma(null, [{ id: CINTA, quantity: 3 }]);

    await expect(
      service.associateEquipmentsToAccessory({
        equipmentId: UNIDADE,
        accessoryIds: [CINTA],
      }),
    ).rejects.toMatchObject({ code: 'equipment_not_found' });
  });

  it('associa a unidade disponivel, e cada acessorio consome uma unidade do estoque', async () => {
    const { service, acessorios, associacoes } = fakePrisma(
      StatusEquipment.AVAILABLE,
      [
        { id: CINTA, quantity: 3 },
        { id: MANGUEIRA, quantity: 1 },
      ],
    );

    const resultado = await service.associateEquipmentsToAccessory({
      equipmentId: UNIDADE,
      accessoryIds: [CINTA, MANGUEIRA],
    });

    expect(resultado.registers).toBe(2);
    expect(acessorios.map((item) => item.quantity)).toEqual([2, 0]);
    expect(associacoes).toHaveLength(2);
  });

  it('o mesmo acessorio repetido no corpo vale uma vez', async () => {
    const { service, acessorios, associacoes } = fakePrisma(
      StatusEquipment.AVAILABLE,
      [{ id: CINTA, quantity: 2 }],
    );

    await service.associateEquipmentsToAccessory({
      equipmentId: UNIDADE,
      accessoryIds: [CINTA, CINTA],
    });

    expect(acessorios[0].quantity).toBe(1);
    expect(associacoes).toHaveLength(1);
  });

  it('recusa acessorio sem estoque', async () => {
    const { service, associacoes } = fakePrisma(StatusEquipment.AVAILABLE, [
      { id: CINTA, quantity: 0 },
    ]);

    await expect(
      service.associateEquipmentsToAccessory({
        equipmentId: UNIDADE,
        accessoryIds: [CINTA],
      }),
    ).rejects.toMatchObject({ code: 'accessories_unavailable' });

    expect(associacoes).toHaveLength(0);
  });
});
