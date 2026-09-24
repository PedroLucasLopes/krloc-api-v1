import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/global/prisma/prisma.module';
import { AccessoryService } from './service/accessory.service';
import { AccessoryController } from './controller/accessory.controller';
import { FileModule } from '../file/file.module';

@Module({
  imports: [PrismaModule, FileModule],
  controllers: [AccessoryController],
  providers: [AccessoryService],
})
export class AccessoryModule {}
