import {
  BadRequestException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  ELease,
  LeaseStatus,
  Prisma,
  StatusEquipment,
} from 'generated/prisma/client';
import { PrismaService } from 'src/global/prisma/prisma.service';
import { FilterELeaseDto } from '../dto/filterELease.dto';
import { PaginationConfig } from 'src/global/utils/pagination.utils';
import { CreateELeaseDto } from '../dto/createELease.dto';
import { CustomEquipmentInContract } from '../dto/customEquipmentInContract.dto';
import { Equipment } from 'generated/prisma/client';
import { EquipmentsEditStatus } from '../dto/equipmentsEditStatus.dto';
import { ReplaceEquipmentDto } from '../dto/replaceEquipment.dto';
import { LeaseItemAccessoryData } from '../types/leaseItemAccessoryData';
import { EquipmentWithAccessories } from '../types/equipmentWithAccessories';

@Injectable()
export class ELeaseService {
  constructor(private prisma: PrismaService) {}

  async findAll(filter: FilterELeaseDto): Promise<ELease[]> {
    const { page, limit } = PaginationConfig(filter);
    const elease = await this.prisma.eLease.findMany({
      where: {
        ...(filter?.lesseeId && {
          lesseeId: { contains: filter.lesseeId, mode: 'insensitive' },
        }),
        ...(filter?.startDate && {
          startDate: { equals: new Date(filter.startDate) },
        }),
        ...(filter?.endDate && {
          endDate: { equals: new Date(filter.endDate) },
        }),
        ...(filter?.status && {
          status: { equals: filter.status },
        }),
        ...(filter?.equipmentName && {
          equipments: {
            some: {
              name: {
                contains: filter.equipmentName,
                mode: 'insensitive',
              },
            },
          },
        }),
      },
      include: {
        lessee: {
          include: { client: true },
        },
        leaseItems: true,
        leaseItemAccessories: true,
      },
      ...(filter?.order && {
        orderBy: { startDate: filter.order },
      }),
      skip: page,
      take: limit,
    });

    if (elease.length === 0) {
      throw new NotFoundException('No equipment leases Found');
    }

    return elease;
  }

  async findById(id: string): Promise<ELease> {
    const foundELease = await this.prisma.eLease.findUnique({
      where: { id },
      include: {
        lessee: {
          include: { client: true },
        },
        leaseItems: true,
        leaseItemAccessories: true,
      },
    });

    if (!foundELease) {
      throw new NotFoundException('This contract does not exist');
    }

    return foundELease;
  }

  async createELease(data: CreateELeaseDto): Promise<ELease> {
    const { equipments, ...leaseData } = data;
    const equipmentsFound = await this.prisma.equipment.findMany({
      where: {
        id: { in: equipments },
        status: StatusEquipment.AVAILABLE,
      },
      include: {
        equipmentAccessories: {
          include: {
            accessory: {
              select: {
                id: true,
                name: true,
                p_indemnity: true,
              },
            },
          },
        },
      },
    });
    const checkLesseeId = await this.prisma.lessee.findUnique({
      where: { id: leaseData.lesseeId },
    });

    if (!checkLesseeId) {
      throw new NotFoundException('This lessee do not exist');
    }

    if (equipmentsFound.length < equipments.length) {
      throw new BadRequestException('Some equipments are not available');
    }

    const buildAccessoryData = (
      equipmentsFound: EquipmentWithAccessories[],
      contractId: string,
    ): LeaseItemAccessoryData[] =>
      equipmentsFound.flatMap(({ equipmentAccessories }) => {
        return equipmentAccessories.map(({ accessoryId, accessory }) => ({
          contractId,
          accessoryId,
          name: accessory.name,
          p_indemnity: accessory.p_indemnity,
        }));
      });

    const createLease = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        if (checkLesseeId && equipmentsFound.length === equipments.length) {
          const createLease = await tx.eLease.create({
            data: {
              ...leaseData,
              lesseeId: checkLesseeId.id,
            },
          });

          const updated = await tx.equipment.updateMany({
            where: {
              id: { in: equipments },
              status: StatusEquipment.AVAILABLE,
            },
            data: {
              status: StatusEquipment.PENDING,
              eleaseId: createLease.id,
            },
          });

          if (updated.count !== equipments.length) {
            throw new BadRequestException(
              'Some equipments were already reserved',
            );
          }

          await tx.auditLog.create({
            data: {
              contractId: createLease.id,
              action: AuditAction.CONTRACT_CREATED,
              description: `Contract for ${checkLesseeId.name} created`,
              metadata: {
                equipments,
                lesseeId: checkLesseeId.id,
                lesseeName: checkLesseeId.name,
                clientId: checkLesseeId.clientId,
                startDate: createLease.startDate,
                endDate: createLease.endDate,
              },
            },
          });

          await tx.leaseItem.createMany({
            data: equipmentsFound.map((equipment) => ({
              contractId: createLease.id,
              equipmentId: equipment.id,
              equipmentName: equipment.name,
              equipmentCode: equipment.code,
              equipmentSuffix: equipment.suffix,
              p_diary: equipment.p_diary,
              p_weekly: equipment.p_weekly,
              p_biweekly: equipment.p_biweekly,
              p_monthly: equipment.p_monthly,
              p_indemnity: equipment.p_indemnity,
              startDate: leaseData.startDate,
              startStatus: StatusEquipment.PENDING,
            })),
          });

          if (buildAccessoryData.length > 0) {
            await tx.leaseItemAccessory.createMany({
              data: buildAccessoryData(equipmentsFound, createLease.id),
            });
          }

          return createLease;
        }
      },
    );

    if (!createLease) {
      throw new InternalServerErrorException('Something went wrong!');
    }

    return createLease;
  }

  async startContract(id: string): Promise<ELease> {
    const startContract = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const lease = await tx.eLease.findUnique({
          where: {
            id,
            status: LeaseStatus.PENDING,
          },
          include: {
            equipments: {
              where: {
                status: {
                  not: StatusEquipment.PENDING,
                },
              },
              select: { id: true, status: true },
            },
            lessee: { select: { name: true, clientId: true } },
          },
        });

        if (!lease) {
          throw new NotFoundException('Contract not found');
        }

        if (lease.status !== LeaseStatus.PENDING) {
          throw new BadRequestException(`This contract is ${lease.status}`);
        }

        if (lease.equipments.length > 0) {
          throw new BadRequestException(
            'There are equipments associated with this contract that are not PENDING',
          );
        }

        if (lease.contract_generated === null) {
          throw new BadRequestException(
            'Please generate the equipment lease contract before starting.',
          );
        }

        const [start, ,] = await Promise.all([
          tx.eLease.update({
            where: { id, status: LeaseStatus.PENDING },
            data: { status: LeaseStatus.ACTIVE },
          }),

          tx.equipment.updateMany({
            where: {
              eleaseId: { equals: id },
              status: StatusEquipment.PENDING,
            },
            data: { status: StatusEquipment.LEASED },
          }),

          tx.auditLog.create({
            data: {
              contractId: id,
              action: AuditAction.CONTRACT_STARTED,
              description: `Contract for ${lease.lessee.name} started`,
              metadata: {
                contractId: id,
                reason: LeaseStatus.ACTIVE,
              },
            },
          }),

          tx.leaseItem.updateMany({
            where: { contractId: { equals: id }, startStatus: StatusEquipment.PENDING },
            data: {
              startStatus: StatusEquipment.LEASED,
            },
          }),
        ]);

        return start;
      },
    );

    if (!startContract) {
      throw new InternalServerErrorException('Something went wrong!');
    }

    return startContract;
  }

  async cancelContract(id: string): Promise<ELease> {
    const cancelContract = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const checkContract = await tx.eLease.findUnique({
          where: { id },
          include: {
            equipments: {
              where: {
                status: {
                  not: StatusEquipment.PENDING,
                },
              },
              select: { id: true },
            },
            lessee: {
              select: { id: true, name: true, clientId: true },
            },
          },
        });

        if (!checkContract) {
          throw new NotFoundException('Contract not found');
        }

        if (checkContract.status !== LeaseStatus.PENDING) {
          throw new BadRequestException(
            `This contract is ${checkContract.status}`,
          );
        }

        // Cancelar desfaz reservas. Equipamento do contrato que ja nao esta
        // PENDING mudou de situacao por fora, e nao volta a AVAILABLE sozinho.
        if (checkContract.equipments.length > 0) {
          throw new BadRequestException(
            'There are equipments associated with this contract that are not PENDING',
          );
        }

        const cancelledAt = new Date();

        const [, updatedLease] = await Promise.all([
          tx.equipment.updateMany({
            where: {
              eleaseId: { equals: id },
              status: StatusEquipment.PENDING,
            },
            data: {
              status: StatusEquipment.AVAILABLE,
              eleaseId: null,
            },
          }),

          // Condicionado ao status: um start concorrente faz o cancelamento falhar.
          tx.eLease.update({
            where: { id, status: LeaseStatus.PENDING },
            data: {
              status: LeaseStatus.CANCELLED,
              finishDate: cancelledAt,
            },
          }),

          tx.auditLog.create({
            data: {
              contractId: id,
              action: AuditAction.CONTRACT_CANCELLED,
              description: `Contract for ${checkContract.lessee.name} is canceled`,
              metadata: {
                contractId: id,
                reason: LeaseStatus.CANCELLED,
              },
            },
          }),

          tx.leaseItem.updateMany({
            where: {
              contractId: { equals: id },
              startStatus: StatusEquipment.PENDING,
            },
            data: {
              finalStatus: StatusEquipment.AVAILABLE,
              finishDate: cancelledAt,
            },
          }),
        ]);

        return updatedLease;
      },
    );

    return cancelContract;
  }

  async addEquipmentsToELease(
    id: string,
    equipmentsId: CustomEquipmentInContract,
  ): Promise<ELease> {
    const addEquipments = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const checkContract = await tx.eLease.findUnique({
          where: {
            id,
            status: LeaseStatus.PENDING,
          },
          include: {
            lessee: {
              select: {
                name: true,
              },
            },
          },
        });

        if (!checkContract) {
          throw new NotFoundException('Equipment Lease not Found');
        }

        const equipmentsFound = await tx.equipment.findMany({
          where: {
            id: { in: equipmentsId.equipments },
            status: StatusEquipment.AVAILABLE,
          },
        });

        if (equipmentsId.equipments.length > equipmentsFound.length) {
          throw new BadRequestException('Some equipments are not found');
        }

        if (equipmentsFound && checkContract) {
          const [addEquipments, ,] = await Promise.all([
            tx.eLease.update({
              where: { id },
              data: {
                equipments: {
                  connect: equipmentsId.equipments.map((id) => ({ id })),
                },
              },
            }),

            tx.equipment.updateMany({
              where: {
                id: { in: equipmentsId.equipments },
                status: StatusEquipment.AVAILABLE,
              },
              data: { status: StatusEquipment.PENDING },
            }),

            tx.auditLog.create({
              data: {
                contractId: id,
                action: AuditAction.EQUIPMENT_ADDED,
                description: `Contract for ${checkContract.lessee.name} added some equipments`,
                metadata: {
                  contractId: id,
                  equipments: equipmentsFound,
                },
              },
            }),

            tx.leaseItem.createMany({
              data: equipmentsFound.map((equipment) => ({
                contractId: checkContract.id,
                equipmentId: equipment.id,
                equipmentName: equipment.name,
                equipmentCode: equipment.code,
                equipmentSuffix: equipment.suffix,
                p_diary: equipment.p_diary,
                p_weekly: equipment.p_weekly,
                p_biweekly: equipment.p_biweekly,
                p_monthly: equipment.p_monthly,
                p_indemnity: equipment.p_indemnity,
                startDate: checkContract.startDate,
                startStatus: StatusEquipment.PENDING,
              })),
            }),
          ]);

          return addEquipments;
        }
      },
    );

    if (!addEquipments) {
      throw new InternalServerErrorException('Something went wrong!');
    }

    return addEquipments;
  }

  async removeEquipmentsToELease(
    id: string,
    equipmentsId: CustomEquipmentInContract,
  ): Promise<ELease> {
    const removeEquipments = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const contractExist = await tx.eLease.findUnique({
          where: {
            id,
            status: LeaseStatus.PENDING,
          },
          include: {
            lessee: {
              select: { name: true },
            },
            equipments: { select: { id: true } },
          },
        });

        if (!contractExist) {
          throw new NotFoundException('Equipment Lease not Found');
        }

        if (contractExist.status === LeaseStatus.ACTIVE) {
          throw new BadRequestException('The contract is already Active');
        }

        if (contractExist.equipments.length === 1) {
          throw new BadRequestException(
            'You have only one equipment in your contract',
          );
        }

        const equipmentsFound = await tx.equipment.findMany({
          where: {
            id: { in: equipmentsId.equipments },
            status: StatusEquipment.PENDING,
          },
        });

        if (equipmentsId.equipments.length > equipmentsFound.length) {
          throw new BadRequestException('Some equipments are not available');
        }

        if (equipmentsFound && contractExist) {
          const [removeEquipment, ,] = await Promise.all([
            tx.eLease.update({
              where: { id, status: LeaseStatus.PENDING },
              data: {
                equipments: {
                  disconnect: equipmentsId.equipments.map((id) => ({ id })),
                },
              },
            }),

            tx.equipment.updateMany({
              where: {
                id: { in: equipmentsId.equipments },
                status: StatusEquipment.PENDING,
              },
              data: {
                status: StatusEquipment.AVAILABLE,
              },
            }),

            tx.auditLog.create({
              data: {
                contractId: id,
                action: AuditAction.EQUIPMENT_REMOVED,
                description: `Contract for ${contractExist.lessee.name} removed some equipments`,
                metadata: {
                  contractId: id,
                  equipments: equipmentsFound,
                },
              },
            }),

            tx.leaseItem.deleteMany({
              where: {
                contractId: { equals: id },
                equipmentId: { in: equipmentsId.equipments },
              },
            }),
          ]);

          return removeEquipment;
        }
      },
    );

    if (!removeEquipments) {
      throw new InternalServerErrorException('Something went wrong!');
    }

    return removeEquipments;
  }

  async setUpdateStatusEquipment(
    id: string,
    equipmentsId: EquipmentsEditStatus,
  ): Promise<Equipment[]> {
    const equipmentHash = equipmentsId.equipments.reduce(
      (acc, item: { id: string; status: StatusEquipment }) => {
        if (!acc[item.status]) {
          acc[item.status] = [];
        }

        acc[item.status].push(item.id);

        return acc;
      },
      {} as Record<StatusEquipment, string[]>,
    );

    const updateStatus = await Promise.all(
      (Object.entries(equipmentHash) as [StatusEquipment, string[]][]).map(
        ([status, ids]) =>
          this.activeELeaseUpdateEquipment(id, { equipments: ids }, status),
      ),
    );

    return updateStatus.flat();
  }

  private async activeELeaseUpdateEquipment(
    id: string,
    equipmentsId: CustomEquipmentInContract,
    status: StatusEquipment,
  ): Promise<Equipment[]> {
    const { equipments } = equipmentsId;
    const contractExist = await this.prisma.eLease.findUnique({
      where: { id, status: LeaseStatus.ACTIVE },
      include: {
        lessee: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!contractExist) {
      throw new NotFoundException('Contract not found');
    }

    // Registra volta o que esta na obra por ESTE contrato: o que saiu locado e o
    // substituto, que entrou como REPLACE no lugar de um que voltou.
    const outStatus: StatusEquipment[] = [
      StatusEquipment.LEASED,
      StatusEquipment.REPLACE,
    ];
    const outOnContract = {
      id: { in: equipments },
      eleaseId: { equals: id },
      status: { in: outStatus },
    };

    const equipmentsFound = await this.prisma.equipment.findMany({
      where: outOnContract,
    });

    if (equipmentsFound.length < equipments.length) {
      throw new BadRequestException(
        'Some equipments are not available to change',
      );
    }

    const keepELeaseId: StatusEquipment[] = [
      StatusEquipment.STOLEN,
      StatusEquipment.MAINTENANCE,
    ];
    const eleaseId = keepELeaseId.includes(status) ? contractExist.id : null;

    const updateEquipmentStatus = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const [updated] = await Promise.all([
          tx.equipment.updateMany({
            where: outOnContract,
            data: { eleaseId, status },
          }),

          tx.auditLog.create({
            data: {
              contractId: id,
              action: AuditAction.EQUIPMENT_STATUS_CHANGED,
              description: `Contract for ${contractExist.lessee.name} changed some equipments status`,
              metadata: {
                contractId: id,
                equipments: equipmentsFound.map((equipment) => ({
                  ...equipment,
                  status: status,
                })),
              },
            },
          }),

          tx.leaseItem.updateMany({
            where: {
              contractId: { equals: id },
              equipmentId: { in: equipments },
              startStatus: { in: outStatus },
              finalStatus: null,
            },
            data: {
              finalStatus: status,
              finishDate: status === StatusEquipment.STOLEN ? null : new Date(),
            },
          }),
        ]);

        // Outra volta do mesmo equipamento chegou antes desta.
        if (updated.count !== equipments.length) {
          throw new BadRequestException(
            'Some equipments are not available to change',
          );
        }

        return equipmentsFound.map((equipment) => ({
          ...equipment,
          eleaseId,
          status,
        }));
      },
    );

    return updateEquipmentStatus;
  }

  async replaceEquipment(
    contractId: string,
    body: ReplaceEquipmentDto,
  ): Promise<ELease> {
    const { replacements } = body;

    const contract = await this.prisma.eLease.findUnique({
      where: { id: contractId, status: LeaseStatus.ACTIVE },
      include: { lessee: { select: { name: true } } },
    });

    if (!contract) {
      throw new NotFoundException('Active contract not found');
    }

    const oldIds = replacements.map((r) => r.oldEquipmentId);
    const newIds = replacements.map((r) => r.newEquipmentId);

    // 2. Garante que não há duplicatas no array enviado
    const uniqueOldIds = new Set(oldIds);
    const uniqueNewIds = new Set(newIds);

    if (
      uniqueOldIds.size !== oldIds.length ||
      uniqueNewIds.size !== newIds.length
    ) {
      throw new BadRequestException('Duplicate equipment ids in replacements');
    }

    // 3. Busca todos os leaseItems relevantes de uma vez
    const oldLeaseItems = await this.prisma.leaseItem.findMany({
      where: {
        contractId,
        equipmentId: { in: oldIds },
        finalStatus: {
          in: [StatusEquipment.MAINTENANCE, StatusEquipment.STOLEN],
        },
      },
    });

    if (oldLeaseItems.length !== replacements.length) {
      throw new BadRequestException(
        'One or more equipments were not found as MAINTENANCE or STOLEN items in this contract',
      );
    }

    // 4. Busca todos os equipamentos antigos e novos de uma vez
    const [oldEquipments, newEquipments] = await Promise.all([
      this.prisma.equipment.findMany({
        where: {
          id: { in: oldIds },
          status: { in: [StatusEquipment.MAINTENANCE, StatusEquipment.STOLEN] },
        },
        include: {
          equipmentAccessories: {
            select: {
              accessoryId: true,
            },
          },
        },
      }),
      this.prisma.equipment.findMany({
        where: { id: { in: newIds }, status: StatusEquipment.AVAILABLE },
        include: {
          equipmentAccessories: {
            select: {
              accessory: {
                select: {
                  id: true,
                  name: true,
                  p_indemnity: true,
                },
              },
            },
          },
        },
      }),
    ]);

    if (oldEquipments.length !== replacements.length) {
      throw new BadRequestException(
        'One or more old equipments are not in MAINTENANCE or STOLEN status',
      );
    }

    if (newEquipments.length !== replacements.length) {
      throw new BadRequestException(
        'One or more new equipments are not available',
      );
    }

    // 5. Monta mapas para lookup O(1) e valida compatibilidade par a par
    const oldEquipmentMap = new Map(oldEquipments.map((e) => [e.id, e]));
    const newEquipmentMap = new Map(newEquipments.map((e) => [e.id, e]));
    const oldLeaseItemMap = new Map(
      oldLeaseItems.map((i) => [i.equipmentId, i]),
    );

    for (const { oldEquipmentId, newEquipmentId } of replacements) {
      const oldEq = oldEquipmentMap.get(oldEquipmentId);
      const newEq = newEquipmentMap.get(newEquipmentId);

      if (!oldEq || !newEq) {
        throw new BadRequestException(
          `Could not resolve equipment pair: ${oldEquipmentId} → ${newEquipmentId}`,
        );
      }

      if (newEq.code !== oldEq.code) {
        throw new BadRequestException(
          `Equipment type mismatch: cannot replace ${oldEq.code}-${oldEq.suffix} with ${newEq.code}-${newEq.suffix}`,
        );
      }

      if (newEq.suffix === oldEq.suffix) {
        throw new BadRequestException(
          `New equipment ${newEq.code}-${newEq.suffix} must have a different suffix from the old one`,
        );
      }

      if (
        newEq.equipmentAccessories.length !== oldEq.equipmentAccessories.length
      ) {
        throw new BadRequestException('Some accessories are missing');
      }
    }

    const maintenanceIds = oldIds.filter(
      (id) => oldEquipmentMap.get(id)!.status === StatusEquipment.MAINTENANCE,
    );

    // 6. Transação: executa todas as trocas atomicamente
    const updatedLease = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await Promise.all([
          tx.equipment.updateMany({
            where: { id: { in: newIds }, status: StatusEquipment.AVAILABLE },
            data: {
              status: StatusEquipment.REPLACE,
            },
          }),

          // Desconecta todos os antigos e conecta todos os novos
          tx.eLease.update({
            where: { id: contractId, status: LeaseStatus.ACTIVE },
            data: {
              equipments: {
                disconnect: maintenanceIds.map((id) => ({ id })),
                connect: newIds.map((id) => ({ id })),
              },
            },
          }),

          // Cria leaseItems dos novos herdando startDate do leaseItem antigo correspondente
          tx.leaseItem.createMany({
            data: replacements.map(({ oldEquipmentId, newEquipmentId }) => {
              const newEq = newEquipmentMap.get(newEquipmentId)!;
              const billingStartDate =
                oldLeaseItemMap.get(oldEquipmentId)!.startDate;

              return {
                contractId,
                equipmentId: newEq.id,
                equipmentName: newEq.name,
                equipmentCode: newEq.code,
                equipmentSuffix: newEq.suffix,
                p_diary: newEq.p_diary,
                p_weekly: newEq.p_weekly,
                p_biweekly: newEq.p_biweekly,
                p_monthly: newEq.p_monthly,
                p_indemnity: newEq.p_indemnity,
                startStatus: StatusEquipment.REPLACE,
                startDate: billingStartDate,
              };
            }),
          }),

          tx.leaseItemAccessory.createMany({
            data: replacements.flatMap(({ newEquipmentId }) => {
              const newAccessories =
                newEquipmentMap.get(newEquipmentId)!.equipmentAccessories;

              return newAccessories.map(({ accessory }) => ({
                contractId,
                accessoryId: accessory.id,
                name: accessory.name,
                p_indemnity: accessory.p_indemnity,
              }));
            }),
          }),

          tx.auditLog.create({
            data: {
              contractId,
              action: AuditAction.EQUIPMENT_REPLACE,
              description: `Contract for ${contract.lessee.name} replaced ${replacements.length} equipment(s)`,
              metadata: {
                replacements: replacements.map(
                  ({ oldEquipmentId, newEquipmentId }) => {
                    const oldEq = oldEquipmentMap.get(oldEquipmentId)!;
                    const newEq = newEquipmentMap.get(newEquipmentId)!;
                    const isStolen = oldEq.status === StatusEquipment.STOLEN;
                    return {
                      old: {
                        id: oldEq.id,
                        code: oldEq.code,
                        suffix: oldEq.suffix,
                        status: oldEq.status,
                        keepELeaseId: isStolen,
                      },
                      new: {
                        id: newEq.id,
                        code: newEq.code,
                        suffix: newEq.suffix,
                        status: StatusEquipment.REPLACE,
                      },
                      billingStartDate:
                        oldLeaseItemMap.get(oldEquipmentId)!.startDate,
                    };
                  },
                ),
              },
            },
          }),
        ]);

        return tx.eLease.findUnique({
          where: { id: contractId },
          include: { leaseItems: true, lessee: true },
        });
      },
    );

    if (!updatedLease) {
      throw new InternalServerErrorException('Something went wrong');
    }

    return updatedLease;
  }

  async closeContract(id: string): Promise<ELease> {
    const closeContract = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const findContract = await tx.eLease.findUnique({
          where: {
            id,
            status: LeaseStatus.ACTIVE,
          },
          include: {
            leaseItems: {
              where: {
                OR: [
                  { finishDate: null },
                  { finalStatus: null },
                  { finalStatus: StatusEquipment.STOLEN },
                ],
              },
            },
            lessee: {
              select: {
                name: true,
              },
            },
          },
        });

        if (!findContract) {
          throw new NotFoundException('Contract not found');
        }

        if (findContract.leaseItems.length > 0) {
          throw new BadRequestException({
            message: 'Some equipment has not yet been returned',
            statusCode: HttpStatus.BAD_REQUEST,
            equipments: findContract.leaseItems,
          });
        }

        // Com toda volta registrada, o que ainda aponta para o contrato voltou
        // para manutencao sem substituto. O vinculo acaba junto com o contrato;
        // a situacao fica, porque o equipamento continua em manutencao.
        const releasedEquipments = await tx.equipment.findMany({
          where: { eleaseId: id },
          select: { id: true, status: true },
        });

        const finishDate = new Date();

        const [close, ,] = await Promise.all([
          tx.eLease.update({
            where: { id, status: LeaseStatus.ACTIVE },
            data: {
              status: LeaseStatus.COMPLETED,
              finishDate,
            },
          }),

          tx.equipment.updateMany({
            where: { eleaseId: { equals: id } },
            data: { eleaseId: null },
          }),

          tx.auditLog.create({
            data: {
              contractId: findContract.id,
              action: AuditAction.CONTRACT_COMPLETED,
              description: `Contract for ${findContract.lessee.name} is completed`,
              metadata: {
                lesseeName: findContract.lessee.name,
                startDate: findContract.startDate,
                finishDate,
                status: LeaseStatus.COMPLETED,
                releasedEquipments,
              },
            },
          }),
        ]);

        return close;
      },
    );

    if (!closeContract) {
      throw new InternalServerErrorException('Something went wrong');
    }

    return closeContract;
  }
}
