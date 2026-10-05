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
import { SimulationDto } from 'src/routes/finantial/dto/simulation.dto';
import { EquipmentQuoteDto } from '../dto/quote.dto';
import { DocumentService } from '../service/document.service';

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

  @Post('quote/equipment')
  @HttpCode(HttpStatus.OK)
  async generateEquipmentQuote(
    @Body() body: EquipmentQuoteDto,
    @Res() res: Response,
  ): Promise<void> {
    return await this.documentService.generateEquipmentQuote(body, res);
  }

  @Post('quote/contract')
  @HttpCode(HttpStatus.OK)
  async generateContractQuote(
    @Body() body: SimulationDto,
    @Res() res: Response,
  ): Promise<void> {
    return await this.documentService.generateContractQuote(body, res);
  }

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

  @Post('finantial/:id')
  @HttpCode(HttpStatus.OK)
  async generateStatement(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    return await this.documentService.generateStatement(id, res);
  }

  @Post('closure/:id')
  @HttpCode(HttpStatus.OK)
  async generateContractClosure(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    return await this.documentService.generateContractClosure(id, res);
  }
}
