import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/global/prisma/prisma.module';
import { LesseeController } from './controller/lessee.controller';
import { LesseeService } from './service/lessee.service';
import { AddressModule } from 'src/global/address/address.module';

@Module({
  imports: [PrismaModule, AddressModule],
  controllers: [LesseeController],
  providers: [LesseeService],
})
export class LesseeModule {}
