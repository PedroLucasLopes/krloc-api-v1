import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/global/prisma/prisma.module';
import { DocumentService } from './service/document.service';
import { DocumentController } from './controller/document.controller';
import { ELeaseService } from '../elease/service/elease.service';
import { FormatService } from './service/format.service';
import { ReportFormatService } from './service/reportFormat.service';
import { FinantialModule } from '../finantial/finantial.module';

@Module({
  imports: [PrismaModule, FinantialModule],
  controllers: [DocumentController],
  providers: [
    DocumentService,
    ELeaseService,
    FormatService,
    ReportFormatService,
  ],
})
export class DocumentModule {}
