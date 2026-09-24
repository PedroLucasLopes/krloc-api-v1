import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { LeaseStatus } from 'generated/prisma/client';
import { ApiException } from 'src/global/error/apiError';
import { PrismaService } from 'src/global/prisma/prisma.service';
import { statementToApi } from 'src/routes/finantial/billing/statement';
import { BillingService } from 'src/routes/finantial/service/billing.service';
import { date } from '../helper/report.helper';
import { contractDefinition } from '../pdf/contract.pdf';
import { render } from '../pdf/pdf';
import { closingDefinition, statementDefinition } from '../pdf/report.pdf';
import { DocumentTemplateService } from './documentTemplate.service';

const fileDate = (value: Date): string => date(value).replaceAll('/', '-');

const PDF = 'application/pdf';

const encodeFileName = (name: string): string =>
  encodeURIComponent(name).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

@Injectable()
export class DocumentService {
  constructor(
    private prisma: PrismaService,
    private templates: DocumentTemplateService,
    private billing: BillingService,
  ) {}

  private send(
    res: Response,
    buffer: Buffer,
    fileName: string,
    fallback: string,
  ): void {
    res.set({
      'Content-Type': PDF,
      'Content-Disposition': `attachment; filename="${fallback}"; filename*=UTF-8''${encodeFileName(fileName)}`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }

  public async generateContract(id: string, res: Response): Promise<void> {
    const contract = await this.billing.contract(id);

    if (contract.status !== LeaseStatus.PENDING) {
      throw new ApiException('contract_not_found');
    }

    const template = await this.templates.contractById(
      contract.documentTemplateId,
    );
    const statement = statementToApi(await this.billing.compute(contract));
    const buffer = await render(
      contractDefinition(contract, statement, template),
    );

    await this.prisma.eLease.update({
      where: { id: contract.id },
      data: { contract_generated: new Date(), documentTemplateId: template.id },
    });

    this.send(
      res,
      buffer,
      `Contrato ${contract.lessee.name} - ${contract.lessee.client.name} ${fileDate(contract.startDate)}.pdf`,
      'contrato.pdf',
    );
  }

  public async generateStatement(id: string, res: Response): Promise<void> {
    const contract = await this.billing.contract(id);

    if (contract.status !== LeaseStatus.ACTIVE) {
      throw new ApiException('contract_not_active');
    }

    const template = await this.templates.report();
    const statement = statementToApi(await this.billing.compute(contract));
    const buffer = await render(
      statementDefinition(contract, statement, 'extract', template),
    );

    this.send(
      res,
      buffer,
      `Extrato ${contract.lessee.name} - ${contract.lessee.client.name} ${fileDate(new Date())}.pdf`,
      'extrato.pdf',
    );
  }

  public async generateContractClosure(
    id: string,
    res: Response,
  ): Promise<void> {
    const contract = await this.billing.contract(id);

    if (contract.status !== LeaseStatus.COMPLETED) {
      throw new ApiException('contract_not_found');
    }

    const template = await this.templates.report();
    const statement = await this.billing.statement(id);
    const buffer = await render(
      statementDefinition(contract, statement, 'release', template),
    );

    this.send(
      res,
      buffer,
      `Baixa ${contract.lessee.name} - ${contract.lessee.client.name} ${fileDate(contract.startDate)}.pdf`,
      'baixa.pdf',
    );
  }

  public async generateMonthlyClosing(
    month: string,
    res: Response,
  ): Promise<void> {
    const template = await this.templates.report();
    const closing = await this.billing.closing(month);
    const buffer = await render(closingDefinition(closing, template));

    this.send(res, buffer, `Fechamento ${month}.pdf`, 'fechamento.pdf');
  }
}
