import { HttpStatus, Injectable } from '@nestjs/common';
import { Accessory, Prisma, StatusEquipment } from 'generated/prisma/client';
import { PrismaService } from 'src/global/prisma/prisma.service';
import { PaginationConfig } from 'src/global/utils/pagination.utils';
import { FilterAccessory } from '../dto/filterAccessory.dto';
import { Readable } from 'stream';
import { CsvImport } from 'src/global/types/csvImport';
import { CreateAccessory } from '../dto/createAccessory.dto';
import { EditAccessory } from '../dto/editAccessory.dto';
import csv from 'csv-parser';
import { AssociateEquipmentAccessory } from '../dto/associateEquipmentAccessory.dto';
import { EquipmentAccessoryCreated } from '../dto/equipmentAccessoryCreated.dto';
import { ApiException } from 'src/global/error/apiError';

@Injectable()
export class AccessoryService {
  constructor(private prisma: PrismaService) {}

  public async findAll(filter: FilterAccessory): Promise<Accessory[]> {
    const { page, limit } = PaginationConfig(filter);
    const accessories = await this.prisma.accessory.findMany({
      where: {
        ...(filter?.name && {
          name: { contains: filter.name, mode: 'insensitive' },
        }),
      },
      ...(filter?.order && {
        orderBy: { id: filter.order },
      }),
      skip: page,
      take: limit,
    });

    if (!accessories.length) {
      throw new ApiException('no_results');
    }

    return accessories;
  }

  public async findById(id: string): Promise<Accessory> {
    const accessory = await this.prisma.accessory.findUnique({ where: { id } });

    if (!accessory) {
      throw new ApiException('accessory_not_found');
    }

    return accessory;
  }

  public async createAccessory(data: CreateAccessory): Promise<Accessory> {
    const createAccessory = await this.prisma.accessory.create({ data });
    return createAccessory;
  }

  async importCsv(file: Express.Multer.File): Promise<CsvImport> {
    if (!file) {
      throw new ApiException('file_missing');
    }

    const CHUNK_SIZE = 1000;
    let batch: Accessory[] = [];
    let totalInserted = 0;

    const stream = Readable.from(file.buffer).pipe(csv());

    await new Promise<void>((resolve, reject) => {
      const processBatch = async () => {
        const formattedBatch = batch.map((item) => ({
          ...item,
          name: item?.name,
          quantity: Number(item?.quantity),
          p_indemnity: Number(String(item?.p_indemnity).replace(/[=,]/g, '')),
        }));

        const result = await this.prisma.accessory.createMany({
          data: formattedBatch,
          skipDuplicates: true,
        });

        totalInserted += result.count;
        batch = [];
      };

      stream.on('data', (data: Accessory) => {
        stream.pause();

        batch.push(data);

        if (batch.length >= CHUNK_SIZE) {
          processBatch()
            .then(() => stream.resume())
            .catch(reject);
        } else {
          stream.resume();
        }
      });

      stream.on('end', () => {
        if (batch.length > 0) {
          processBatch()
            .then(() => resolve())
            .catch(reject);
        } else {
          resolve();
        }
      });

      stream.on('error', reject);
    });

    return {
      message: 'CSV imported successfully',
      registers: totalInserted,
      statusCode: HttpStatus.CREATED,
    };
  }

  public async associateEquipmentsToAccessory(
    data: AssociateEquipmentAccessory,
  ): Promise<EquipmentAccessoryCreated> {
    const [equipment, accessories] = await Promise.all([
      this.prisma.equipment.findMany({
        where: {
          id: data.equipmentId,
          status: StatusEquipment.AVAILABLE,
        },
      }),

      this.prisma.accessory.findMany({
        where: {
          id: { in: data.accessoryIds },
          quantity: { gt: 0 },
        },
      }),
    ]);

    if (!equipment) {
      throw new ApiException('equipment_not_found');
    }

    if (accessories.length < data.accessoryIds.length) {
      throw new ApiException('accessories_unavailable');
    }

    const createEquipmentAccessory = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const [, createAssociation] = await Promise.all([
          tx.accessory.updateMany({
            where: { id: { in: data.accessoryIds }, quantity: { gt: 0 } },
            data: {
              quantity: { decrement: 1 },
            },
          }),

          tx.equipmentAccessory.createMany({
            data: data.accessoryIds.map((ids) => ({
              equipmentId: data.equipmentId,
              accessoryId: ids,
            })),
          }),
        ]);

        return createAssociation;
      },
    );

    const totalInserted = createEquipmentAccessory.count;

    return {
      message: 'Association created successfully',
      registers: totalInserted,
      statusCode: HttpStatus.CREATED,
    };
  }

  public async updateAccessory(
    id: string,
    data: EditAccessory,
  ): Promise<Accessory> {
    const findAccessory = await this.prisma.accessory.findUnique({
      where: { id },
    });

    if (!findAccessory) {
      throw new ApiException('accessory_not_found');
    }

    if (data.quantity !== undefined && findAccessory.quantity > data.quantity) {
      throw new ApiException('accessory_quantity_decrease');
    }

    const updateAccessory = await this.prisma.accessory.update({
      where: { id },
      data,
    });

    return updateAccessory;
  }

  public async deleteAccessory(id: string): Promise<void> {
    const findAccessory = await this.prisma.accessory.findUnique({
      where: { id },
      include: { equipments: true },
    });

    if (!findAccessory) {
      throw new ApiException('accessory_not_found');
    }

    if (findAccessory.equipments.length > 0) {
      throw new ApiException('accessory_in_use');
    }

    if (findAccessory.quantity > 0) {
      await this.prisma.accessory.update({
        where: { id },
        data: {
          quantity: { decrement: 1 },
        },
      });

      return;
    }

    await this.prisma.accessory.delete({ where: { id } });

    return;
  }
}
