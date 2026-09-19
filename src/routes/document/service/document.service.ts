import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { LeaseStatus } from 'generated/prisma/client';
import { ApiException } from 'src/global/error/apiError';
import { date } from '../helper/report.helper';
import { PrismaService } from 'src/global/prisma/prisma.service';
import { statementToApi } from 'src/routes/finantial/billing/statement';
import { BillingService } from 'src/routes/finantial/service/billing.service';
import { FormatService } from './format.service';
import { ReportFormatService } from './reportFormat.service';

/** Data no nome do arquivo: o dia de Sao Paulo, como no documento, e com hifen, que barra nao vale em nome de arquivo. */
const fileDate = (value: Date): string => date(value).replaceAll('/', '-');

const DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Nome de arquivo no `filename*` (RFC 5987): `encodeURIComponent` deixa passar
 * `'`, `(`, `)` e `*`, que nao sao attr-char. Uma obra chamada "D'Avila"
 * quebrava o cabecalho e o navegador perdia o nome.
 */
const encodeFileName = (name: string): string =>
  encodeURIComponent(name).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

@Injectable()
export class DocumentService {
  constructor(
    private prisma: PrismaService,
    private file: FormatService,
    private reports: ReportFormatService,
    private billing: BillingService,
  ) {}

  /**
   * `filename` e o nome ASCII para cliente antigo; `filename*` leva o nome com
   * acento (RFC 6266). O front le o segundo.
   */
  private send(
    res: Response,
    buffer: Buffer,
    fileName: string,
    fallback: string,
  ): void {
    res.set({
      'Content-Type': DOCX,
      'Content-Disposition': `attachment; filename="${fallback}"; filename*=UTF-8''${encodeFileName(fileName)}`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }

  /** O contrato para assinar, com o valor contratado e a tabela de precos de cada equipamento. */
  public async generateContract(id: string, res: Response): Promise<void> {
    const contract = await this.billing.contract(id);

    if (contract.status !== LeaseStatus.PENDING) {
      throw new ApiException('contract_not_found');
    }

    const statement = statementToApi(await this.billing.compute(contract));
    const buffer = await this.file.contract(contract, statement);

    await this.prisma.eLease.update({
      where: { id: contract.id },
      data: { contract_generated: new Date() },
    });

    this.send(
      res,
      buffer,
      `Contrato ${contract.lessee.name} - ${contract.lessee.client.name} ${fileDate(contract.startDate)}.docx`,
      'contrato.docx',
    );
  }

  /** O extrato de um contrato ativo: o que correu ate hoje, pelas clausulas. */
  public async generateStatement(id: string, res: Response): Promise<void> {
    const contract = await this.billing.contract(id);

    if (contract.status !== LeaseStatus.ACTIVE) {
      throw new ApiException('contract_not_active');
    }

    const statement = statementToApi(await this.billing.compute(contract));
    const buffer = await this.reports.statement(contract, statement, 'extract');

    this.send(
      res,
      buffer,
      `Extrato ${contract.lessee.name} - ${contract.lessee.client.name} ${fileDate(new Date())}.docx`,
      'extrato.docx',
    );
  }

  /** A baixa de um contrato concluido (clausula 10a), com o extrato gravado no fechamento. */
  public async generateContractClosure(
    id: string,
    res: Response,
  ): Promise<void> {
    const contract = await this.billing.contract(id);

    if (contract.status !== LeaseStatus.COMPLETED) {
      throw new ApiException('contract_not_found');
    }

    const statement = await this.billing.statement(id);
    const buffer = await this.reports.statement(contract, statement, 'release');

    this.send(
      res,
      buffer,
      `Baixa ${contract.lessee.name} - ${contract.lessee.client.name} ${fileDate(contract.startDate)}.docx`,
      'baixa.docx',
    );
  }

  /** O fechamento do mes, em documento. */
  public async generateMonthlyClosing(
    month: string,
    res: Response,
  ): Promise<void> {
    const closing = await this.billing.closing(month);
    const buffer = await this.reports.closing(closing);

    this.send(res, buffer, `Fechamento ${month}.docx`, 'fechamento.docx');
  }
}
