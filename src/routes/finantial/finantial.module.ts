import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/global/prisma/prisma.module';
import { FinantialController } from './controller/finantial.controller';
import { BillingService } from './service/billing.service';

@Module({
  imports: [PrismaModule],
  controllers: [FinantialController],
  providers: [BillingService],
  exports: [BillingService],
})
export class FinantialModule {}
