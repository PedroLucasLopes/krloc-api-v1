import { StatusEquipment } from 'generated/prisma/client';
import { PrismaService } from 'src/global/prisma/prisma.service';
import { AccessoryService } from './accessory.service';

interface Stock {
  id: string;
  quantity: number;
}

const UNIT = '0f2a8b3c-1d4e-4f6a-8b9c-0d1e2f3a4b5c';
const STRAP = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const HOSE = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';

function fakePrisma(status: StatusEquipment | null, stock: Stock[]) {
  const accessories = stock.map((item) => ({ ...item }));
  const associations: { equipmentId: string; accessoryId: string }[] = [];

  const tx = {
    accessory: {
      updateMany: ({ where }: { where: { id: { in: string[] } } }) => {
        const reached = accessories.filter(
          (item) => where.id.in.includes(item.id) && item.quantity > 0,
        );

        for (const item of reached) item.quantity -= 1;

        return Promise.resolve({ count: reached.length });
      },
    },
    equipmentAccessory: {
      createMany: ({
        data,
      }: {
        data: { equipmentId: string; accessoryId: string }[];
      }) => {
        associations.push(...data);
        return Promise.resolve({ count: data.length });
      },
    },
  };

  const prisma = {
    equipment: {
      findUnique: () => Promise.resolve(status && { id: UNIT, status }),
    },
    accessory: {
      findMany: ({
        where,
      }: {
        where: { id: { in: string[] }; quantity: { gt: number } };
      }) =>
        Promise.resolve(
          accessories.filter(
            (item) => where.id.in.includes(item.id) && item.quantity > 0,
          ),
        ),
    },
    $transaction: <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx),
  };

  return {
    service: new AccessoryService(prisma as unknown as PrismaService),
    accessories,
    associations,
  };
}

describe('associar acessorio a equipamento', () => {
  it.each([
    StatusEquipment.PENDING,
    StatusEquipment.LEASED,
    StatusEquipment.REPLACE,
    StatusEquipment.MAINTENANCE,
    StatusEquipment.STOLEN,
    StatusEquipment.RETIRED,
  ])('recusa unidade %s, e o estoque nao se mexe', async (status) => {
    const { service, accessories, associations } = fakePrisma(status, [
      { id: STRAP, quantity: 3 },
    ]);

    await expect(
      service.associateEquipmentsToAccessory({
        equipmentId: UNIT,
        accessoryIds: [STRAP],
      }),
    ).rejects.toMatchObject({ code: 'equipment_unavailable' });

    expect(accessories[0].quantity).toBe(3);
    expect(associations).toHaveLength(0);
  });

  it('recusa unidade que nao existe', async () => {
    const { service } = fakePrisma(null, [{ id: STRAP, quantity: 3 }]);

    await expect(
      service.associateEquipmentsToAccessory({
        equipmentId: UNIT,
        accessoryIds: [STRAP],
      }),
    ).rejects.toMatchObject({ code: 'equipment_not_found' });
  });

  it('associa a unidade disponivel, e cada acessorio consome uma unidade do estoque', async () => {
    const { service, accessories, associations } = fakePrisma(
      StatusEquipment.AVAILABLE,
      [
        { id: STRAP, quantity: 3 },
        { id: HOSE, quantity: 1 },
      ],
    );

    const result = await service.associateEquipmentsToAccessory({
      equipmentId: UNIT,
      accessoryIds: [STRAP, HOSE],
    });

    expect(result.registers).toBe(2);
    expect(accessories.map((item) => item.quantity)).toEqual([2, 0]);
    expect(associations).toHaveLength(2);
  });

  it('o mesmo acessorio repetido no corpo vale uma vez', async () => {
    const { service, accessories, associations } = fakePrisma(
      StatusEquipment.AVAILABLE,
      [{ id: STRAP, quantity: 2 }],
    );

    await service.associateEquipmentsToAccessory({
      equipmentId: UNIT,
      accessoryIds: [STRAP, STRAP],
    });

    expect(accessories[0].quantity).toBe(1);
    expect(associations).toHaveLength(1);
  });

  it('recusa acessorio sem estoque', async () => {
    const { service, associations } = fakePrisma(StatusEquipment.AVAILABLE, [
      { id: STRAP, quantity: 0 },
    ]);

    await expect(
      service.associateEquipmentsToAccessory({
        equipmentId: UNIT,
        accessoryIds: [STRAP],
      }),
    ).rejects.toMatchObject({ code: 'accessories_unavailable' });

    expect(associations).toHaveLength(0);
  });
});
