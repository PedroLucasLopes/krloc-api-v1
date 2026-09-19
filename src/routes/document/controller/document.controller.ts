import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { HEAVY_ROUTE_LIMIT } from 'src/global/utils/throttle';
import { currentMonth } from 'src/routes/finantial/billing/calendar';
import { ClosingQueryDto } from 'src/routes/finantial/dto/closingQuery.dto';
import { DocumentService } from '../service/document.service';

/** Todo documento e montado na hora, no mesmo processo: rota cara. */
@Controller('generate')
@Throttle(HEAVY_ROUTE_LIMIT)
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post('contract/:id')
  @HttpCode(HttpStatus.OK)
  async generateContract(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    return await this.documentService.generateContract(id, res);
  }

  /** O fechamento do mes em documento. Corpo `{ month: "AAAA-MM" }`; sem ele, o mes corrente. */
  @Post('finantial')
  @HttpCode(HttpStatus.OK)
  async generateMonthlyClosing(
    @Body() body: ClosingQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    return await this.documentService.generateMonthlyClosing(
      body.month ?? currentMonth(),
      res,
    );
  }

  /** O extrato de um contrato ativo. */
  @Post('finantial/:id')
  @HttpCode(HttpStatus.OK)
  async generateStatement(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    return await this.documentService.generateStatement(id, res);
  }

  /** A baixa de um contrato concluido. */
  @Post('closure/:id')
  @HttpCode(HttpStatus.OK)
  async generateContractClosure(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    return await this.documentService.generateContractClosure(id, res);
  }
}
