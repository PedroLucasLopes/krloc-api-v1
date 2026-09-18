import { HttpStatus, Injectable } from '@nestjs/common';
import { Equipment, StatusEquipment } from 'generated/prisma/client';
import { PrismaService } from 'src/global/prisma/prisma.service';
import { validateCode } from '../utils/validateCode.utils';
import { CreateEquipmentDto } from '../dto/createEquipment.dto';
import { EditEquipmentDto } from '../dto/editEquipment.dto';
import { PaginationConfig } from 'src/global/utils/pagination.utils';
import { FilterEquipmentDTO } from '../dto/filterequipment.dto';
import csv from 'csv-parser';
import { Readable } from 'stream';
import { CsvImport } from 'src/global/types/csvImport';
import { parseStatus } from '../utils/parseStatus.utils';
import { ApiException } from 'src/global/error/apiError';

@Injectable()
export class EquipmentService {
  constructor(private prisma: PrismaService) {}
  async findAll(filter?: FilterEquipmentDTO): Promise<Equipment[]> {
    const { page, limit } = PaginationConfig(filter);

    const equipments: Equipment[] = await this.prisma.equipment.findMany({
      where: {
        ...(filter?.name && {
          name: { contains: filter.name, mode: 'insensitive' },
        }),
        ...(filter?.code && {
          code: { contains: filter.code, mode: 'insensitive' },
        }),
        ...(filter?.status && { status: filter.status }),
      },
      ...(filter?.order && {
        orderBy: { suffix: filter.order },
      }),
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
      skip: page,
      take: limit,
    });

    if (equipments.length === 0) {
      throw new ApiException('no_results');
    }

    return equipments;
  }

  async findById(id: string): Promise<Equipment> {
    const equipment: Equipment | null = await this.prisma.equipment.findUnique({
      where: { id },
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
    });

    if (!equipment) {
      throw new ApiException('equipment_not_found');
    }

    return equipment;
  }

  async createEquipment(data: CreateEquipmentDto): Promise<Equipment> {
    const code: string = validateCode(data.code);
    const equipmentValidated: CreateEquipmentDto = {
      ...data,
      code,
    };

    const equipment: Equipment = await this.prisma.equipment.create({
      data: equipmentValidated,
    });

    return equipment;
  }

  async importCsv(file: Express.Multer.File): Promise<CsvImport> {
    if (!file) {
      throw new ApiException('file_missing');
    }

    const CHUNK_SIZE = 1000;
    let batch: Equipment[] = [];
    let totalInserted = 0;

    const stream = Readable.from(file.buffer).pipe(csv());

    await new Promise<void>((resolve, reject) => {
      const processBatch = async () => {
        const formattedBatch = batch.map((item) => ({
          ...item,
          p_diary: Number(item.p_diary),
          p_weekly: Number(item?.p_weekly),
          p_biweekly: Number(item?.p_biweekly),
          p_monthly: Number(item?.p_monthly),
          p_indemnity: Number(String(item?.p_indemnity).replace(/[=,]/g, '')),
          code: validateCode(item.code?.trim()),
          status: parseStatus(item.status),
        }));

        const result = await this.prisma.equipment.createMany({
          data: formattedBatch,
          skipDuplicates: true,
        });

        totalInserted += result.count;
        batch = [];
      };

      stream.on('data', (data: Equipment) => {
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

  async editEquipment(id: string, data: EditEquipmentDto): Promise<Equipment> {
    const updateData: EditEquipmentDto = { ...data };

    await this.equipmentIsRented(id);

    if (data.code) {
      updateData.code = validateCode(data.code);
    }

    return this.prisma.equipment.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteEquipment(id: string): Promise<void> {
    await this.equipmentIsRented(id);
    await this.prisma.equipment.update({
      where: { id },
      data: { status: StatusEquipment.RETIRED },
    });
  }

  private async equipmentIsRented(id: string): Promise<void> {
    const findEquipment = await this.prisma.equipment.findUnique({
      where: {
        id,
        status: {
          not: StatusEquipment.LEASED,
        },
      },
    });

    if (!findEquipment) {
      throw new ApiException('equipment_leased');
    }
  }
}
