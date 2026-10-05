import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/global/prisma/prisma.module';
import { DocumentService } from './service/document.service';
import { DocumentController } from './controller/document.controller';
import { DocumentTemplateController } from './controller/documentTemplate.controller';
import { ELeaseService } from '../elease/service/elease.service';
import { DocumentTemplateService } from './service/documentTemplate.service';
import { FinantialModule } from '../finantial/finantial.module';

@Module({
  imports: [PrismaModule, FinantialModule],
  controllers: [DocumentController, DocumentTemplateController],
  providers: [DocumentService, ELeaseService, DocumentTemplateService],
})
export class DocumentModule {}
