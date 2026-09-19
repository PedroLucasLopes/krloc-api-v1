import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/global/prisma/prisma.module';
import { FinantialController } from './controller/finantial.controller';
import { BillingService } from './service/billing.service';

/**
 * Cobranca pelas clausulas do contrato. `BillingService` e exportado: o fluxo do
 * contrato congela o extrato no fechamento, e os documentos o imprimem.
 */
@Module({
  imports: [PrismaModule],
  controllers: [FinantialController],
  providers: [BillingService],
  exports: [BillingService],
})
export class FinantialModule {}
