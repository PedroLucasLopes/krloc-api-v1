import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { HEAVY_ROUTE_LIMIT } from 'src/global/utils/throttle';
import { currentMonth } from '../billing/calendar';
import { StatementDto } from '../billing/statement';
import { ClosingQueryDto } from '../dto/closingQuery.dto';
import { SimulationDto } from '../dto/simulation.dto';
import { BillingService } from '../service/billing.service';

@Controller('finantial')
export class FinantialController {
  constructor(private billing: BillingService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @Throttle(HEAVY_ROUTE_LIMIT)
  async closing(@Query() query: ClosingQueryDto) {
    return await this.billing.closing(query.month ?? currentMonth());
  }

  @Post('simulate')
  @HttpCode(HttpStatus.OK)
  @Throttle(HEAVY_ROUTE_LIMIT)
  async simulate(@Body() body: SimulationDto): Promise<StatementDto> {
    return await this.billing.simulate(body);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async statement(@Param('id') id: string): Promise<StatementDto> {
    return await this.billing.statement(id);
  }
}
