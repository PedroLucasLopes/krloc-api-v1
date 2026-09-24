import { Injectable, Logger } from '@nestjs/common';
import { DocumentKind, Prisma } from 'generated/prisma/client';
import { ApiException } from 'src/global/error/apiError';
import { PrismaService } from 'src/global/prisma/prisma.service';
import {
  ContractContent,
  ContractTemplate,
  contractProblem,
  DocumentIssuer,
  DocumentTemplateView,
  ReportContent,
  ReportTemplate,
  reportProblem,
} from '../types/documentTemplate';

const CACHE_MS = 60_000;

type Row = {
  id: string;
  kind: DocumentKind;
  version: number;
  issuer: Prisma.JsonValue;
  content: Prisma.JsonValue;
  logo: string | null;
  createdAt: Date;
};

@Injectable()
export class DocumentTemplateService {
  private readonly logger = new Logger(DocumentTemplateService.name);
  private readonly cache = new Map<DocumentKind, { row: Row; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async contract(): Promise<ContractTemplate> {
    return this.checked<ContractContent>(
      await this.activeRow(DocumentKind.CONTRACT),
      contractProblem,
    );
  }

  async report(): Promise<ReportTemplate> {
    return this.checked<ReportContent>(
      await this.activeRow(DocumentKind.REPORT),
      reportProblem,
    );
  }

  async contractById(id: string | null): Promise<ContractTemplate> {
    if (!id) return this.contract();

    const row = await this.prisma.documentTemplate.findUnique({
      where: { id },
    });

    if (!row) return this.contract();

    return this.checked<ContractContent>(row, contractProblem);
  }

  async versions(
    kind: DocumentKind,
  ): Promise<{ id: string; version: number; createdAt: Date }[]> {
    return this.prisma.documentTemplate.findMany({
      where: { kind },
      select: { id: true, version: true, createdAt: true },
      orderBy: { version: 'desc' },
    });
  }

  private async activeRow(kind: DocumentKind): Promise<Row> {
    const cached = this.cache.get(kind);

    if (cached && Date.now() - cached.at < CACHE_MS) return cached.row;

    const row = await this.prisma.documentTemplate.findFirst({
      where: { kind },
      orderBy: { version: 'desc' },
    });

    if (!row) {
      throw new ApiException('document_template_missing', { kind });
    }

    this.cache.set(kind, { row, at: Date.now() });

    return row;
  }

  private checked<Content>(
    row: Row,
    problemOf: (issuer: unknown, content: unknown) => string | null,
  ): DocumentTemplateView<Content> {
    const problem = problemOf(row.issuer, row.content);

    if (problem) {
      this.logger.error(
        `modelo ${row.kind} versao ${row.version} recusado: ${problem}`,
      );

      throw new ApiException('document_template_invalid', {
        kind: row.kind,
        version: row.version,
      });
    }

    return {
      id: row.id,
      kind: row.kind,
      version: row.version,
      issuer: row.issuer as unknown as DocumentIssuer,
      content: row.content as unknown as Content,
      logo: row.logo,
      createdAt: row.createdAt,
    };
  }
}
