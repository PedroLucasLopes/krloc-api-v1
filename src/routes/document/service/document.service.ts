import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { LeaseStatus } from 'generated/prisma/client';
import { PrismaService } from 'src/global/prisma/prisma.service';
import { FinantialReportDto } from '../dto/finantialReport.dto';
import { FormatService } from './format.service';
import { ApiException } from 'src/global/error/apiError';

@Injectable()
export class DocumentService {
  constructor(
    private prisma: PrismaService,
    private file: FormatService,
  ) {}

  public async generateContract(id: string, res: Response): Promise<void> {
    const contract = await this.prisma.eLease.findUnique({
      where: { id, status: LeaseStatus.PENDING },
      include: {
        leaseItems: true,
        lessee: {
          include: {
            client: true,
          },
        },
      },
    });

    if (!contract) {
      throw new ApiException('contract_not_found');
    }

    const buffer = await this.file.contract(contract);
    const fileName = `Contrato ${contract.lessee.name} - ${contract.lessee.client.name} ${contract.startDate.toLocaleDateString('pt-BR')}.docx`;

    await this.prisma.eLease.update({
      where: { id: contract.id },
      data: {
        contract_generated: new Date(),
      },
    });

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="contrato.docx"; filename*=UTF-8''${encodeURIComponent(
        fileName,
      )}`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }

  public async generateFinantialReport(
    id: string,
    res: Response,
    body: FinantialReportDto,
  ): Promise<void> {
    const { startDate, endDate } = body;

    const start = new Date(
      `${new Date(startDate).toISOString().split('T')[0]}T00:00:00.000Z`,
    );
    const end = new Date(
      `${new Date(endDate).toISOString().split('T')[0]}T23:59:59.999Z`,
    );

    const contract = await this.prisma.eLease.findUnique({
      where: { id, status: LeaseStatus.ACTIVE },
      include: {
        lessee: {
          include: { client: true },
        },
        leaseItems: {
          where: {
            startDate: { lte: new Date(end) },
            OR: [
              { finishDate: null },
              {
                finishDate: {
                  gte: new Date(start),
                  lte: new Date(end),
                },
              },
            ],
          },
        },
      },
    });

    if (!contract) {
      throw new ApiException('contract_not_found');
    }

    if (contract.leaseItems && !contract.leaseItems) {
      throw new ApiException('no_activity_in_period');
    }

    const buffer = await this.file.finantialReport(contract);
    const fileName = `Baixa ${contract.lessee.name} - ${contract.lessee.client.name} ${contract.startDate.toLocaleDateString('pt-BR')}.docx`;

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="contrato.docx"; filename*=UTF-8''${encodeURIComponent(
        fileName,
      )}`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }

  public async generateContractClosure(
    id: string,
    res: Response,
  ): Promise<void> {
    const contract = await this.prisma.eLease.findUnique({
      where: { id, status: LeaseStatus.COMPLETED },
      include: {
        leaseItems: true,
        lessee: {
          include: {
            client: true,
          },
        },
      },
    });

    if (!contract) {
      throw new ApiException('contract_not_found');
    }

    const buffer = await this.file.contractClosure(contract);
    const fileName = `Fechamento ${contract.lessee.name} - ${contract.lessee.client.name} ${contract.startDate.toLocaleDateString('pt-BR')}.docx`;

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="contrato.docx"; filename*=UTF-8''${encodeURIComponent(
        fileName,
      )}`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }
}
