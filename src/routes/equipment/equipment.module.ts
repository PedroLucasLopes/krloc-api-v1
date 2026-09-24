import { Module } from '@nestjs/common';
import { EquipmentService } from './service/equipment.service';
import { EquipmentController } from './controller/equipment.controller';
import { PrismaModule } from 'src/global/prisma/prisma.module';
import { FileModule } from '../file/file.module';

@Module({
  imports: [PrismaModule, FileModule],
  controllers: [EquipmentController],
  providers: [EquipmentService],
})
export class EquipmentModule {}
