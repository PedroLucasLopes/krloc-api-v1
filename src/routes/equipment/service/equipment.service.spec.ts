import { StatusEquipment } from 'generated/prisma/client';
import { PrismaService } from 'src/global/prisma/prisma.service';
import { EquipmentService } from './equipment.service';

interface Unit {
  id: string;
  name: string;
  status: StatusEquipment;
}

interface Where {
  id: string;
  status?: StatusEquipment;
}

function fakePrisma(initial: Unit | null, losesRace = false) {
  const unit = initial && { ...initial };

  const save = (data: Partial<Unit>) => {
    for (const [field, value] of Object.entries(data)) {
      if (value !== undefined) {
        (unit as Record<string, unknown>)[field] = value;
      }
    }
  };

  const prisma = {
    equipment: {
      findUnique: () => Promise.resolve(unit),

      update: ({ data }: { data: Partial<Unit> }) => {
        save(data);
        return Promise.resolve(unit);
      },

      updateMany: ({ where, data }: { where: Where; data: Partial<Unit> }) => {
        if (losesRace || (where.status && unit?.status !== where.status)) {
          return Promise.resolve({ count: 0 });
        }

        save(data);
        return Promise.resolve({ count: 1 });
      },
    },
  };

  return {
    service: new EquipmentService(prisma as unknown as PrismaService),
    currentStatus: () => unit?.status,
  };
}

const unit = (status: StatusEquipment): Unit => ({
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
    const { service, currentStatus } = fakePrisma(unit(status));

    await expect(
      service.editEquipment('uma-unidade', { name: 'outro' }),
    ).rejects.toMatchObject({
      code: 'equipment_leased',
    });
    await expect(service.deleteEquipment('uma-unidade')).rejects.toMatchObject({
      code: 'equipment_leased',
    });
    expect(currentStatus()).toBe(status);
  });

  it('edita e desativa o que esta disponivel', async () => {
    const { service, currentStatus } = fakePrisma(
      unit(StatusEquipment.AVAILABLE),
    );

    await service.editEquipment('uma-unidade', { name: 'Betoneira 320L' });
    await service.deleteEquipment('uma-unidade');

    expect(currentStatus()).toBe(StatusEquipment.RETIRED);
  });

  it('id que nao existe responde com o codigo de nao encontrado', async () => {
    const { service } = fakePrisma(null);

    await expect(service.editEquipment('some', {})).rejects.toMatchObject({
      code: 'equipment_not_found',
    });
  });
});

describe('reativacao', () => {
  it('devolve a unidade desativada a frota como disponivel', async () => {
    const { service, currentStatus } = fakePrisma(
      unit(StatusEquipment.RETIRED),
    );

    await service.reactivateEquipment('uma-unidade');

    expect(currentStatus()).toBe(StatusEquipment.AVAILABLE);
  });

  it('nao muda a situacao de quem nao esta desativado', async () => {
    for (const status of [
      StatusEquipment.AVAILABLE,
      StatusEquipment.MAINTENANCE,
      StatusEquipment.STOLEN,
      StatusEquipment.LEASED,
    ]) {
      const { service, currentStatus } = fakePrisma(unit(status));

      await expect(
        service.reactivateEquipment('uma-unidade'),
      ).rejects.toMatchObject({
        code: 'equipment_not_retired',
      });
      expect(currentStatus()).toBe(status);
    }
  });

  it('id que nao existe responde com o codigo de nao encontrado', async () => {
    const { service } = fakePrisma(null);

    await expect(service.reactivateEquipment('some')).rejects.toMatchObject({
      code: 'equipment_not_found',
    });
  });

  it('de duas reativacoes ao mesmo tempo, so uma vale', async () => {
    const { service } = fakePrisma(unit(StatusEquipment.RETIRED), true);

    await expect(
      service.reactivateEquipment('uma-unidade'),
    ).rejects.toMatchObject({
      code: 'equipment_not_retired',
    });
  });
});

describe('edicao sem situacao no corpo', () => {
  it('mantem a situacao gravada', async () => {
    const { service, currentStatus } = fakePrisma(
      unit(StatusEquipment.MAINTENANCE),
    );

    await service.editEquipment('uma-unidade', { name: 'Betoneira 320L' });

    expect(currentStatus()).toBe(StatusEquipment.MAINTENANCE);
  });
});
