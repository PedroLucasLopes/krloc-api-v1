import { Injectable } from '@nestjs/common';
import { LeaseItem } from 'generated/prisma/client';
import { StatusEquipment } from 'generated/prisma/enums';
import { PrismaService } from 'src/global/prisma/prisma.service';
import { ApiException } from 'src/global/error/apiError';

@Injectable()
export class FinantialService {
  constructor(private prisma: PrismaService) {}

  async equipmentCurrentValue(id: string): Promise<void> {
    const contract = await this.prisma.eLease.findUnique({
      where: { id },
      include: {
        leaseItems: true,
      },
    });

    if (!contract) {
      throw new ApiException('contract_not_found');
    }

    const replacedCodes = new Set(
      contract.leaseItems
        .filter((item) => item.startStatus === StatusEquipment.REPLACE)
        .map((item) => item.equipmentCode),
    );

    const filteredItems = contract.leaseItems.filter((item) => {
      if (
        item.finalStatus === StatusEquipment.MAINTENANCE &&
        replacedCodes.has(item.equipmentCode)
      ) {
        return false;
      }
      return true;
    });

    const value = filteredItems.map((item: LeaseItem) => {
      const end = item.finishDate ?? new Date();
      const totalDays =
        Math.ceil(
          (end.getTime() - item.startDate.getTime()) / (1000 * 60 * 60 * 24),
        ) - 1;

      const tiers = [
        { days: 30, price: item.p_monthly },
        { days: 15, price: item.p_biweekly },
        { days: 7, price: item.p_weekly },
        { days: 1, price: item.p_diary },
      ];

      let remaining = totalDays;
      let total = 0;

      for (const tier of tiers) {
        if (tier.price == null) continue;

        const units = Math.floor(remaining / tier.days);
        if (units > 0) {
          total += units * tier.price;
          remaining -= units * tier.days;
        }
      }

      return { ...item, total };
    });

    console.log(value);
  }
}
