import { Controller, Get, Param } from '@nestjs/common';
import { DocumentKind } from 'generated/prisma/client';
import { ApiException } from 'src/global/error/apiError';
import { DocumentTemplateService } from '../service/documentTemplate.service';

const KINDS: Record<string, DocumentKind> = {
  contract: DocumentKind.CONTRACT,
  report: DocumentKind.REPORT,
};

@Controller('document')
export class DocumentTemplateController {
  constructor(private readonly templates: DocumentTemplateService) {}

  private kindOf(value: string): DocumentKind {
    const kind = KINDS[value.toLowerCase()];

    if (!kind) throw new ApiException('no_results');

    return kind;
  }

  @Get('template/:kind')
  async active(@Param('kind') kind: string) {
    const template =
      this.kindOf(kind) === DocumentKind.CONTRACT
        ? await this.templates.contract()
        : await this.templates.report();

    return {
      id: template.id,
      kind: template.kind,
      version: template.version,
      issuer: template.issuer,
      content: template.content,
      hasLogo: template.logo !== null,
      createdAt: template.createdAt,
    };
  }

  @Get('template/:kind/versions')
  async versions(@Param('kind') kind: string) {
    return this.templates.versions(this.kindOf(kind));
  }
}
