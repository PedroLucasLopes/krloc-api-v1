import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { LesseeService } from '../service/lessee.service';
import { FilterLesseeDTO } from '../dto/filterLessee.dto';
import { Client, Lessee } from 'generated/prisma/client';
import { CreateLesseeDTO } from '../dto/createLessee.dto';
import { EditLesseeDto } from '../dto/editLessee.dto';

@Controller('/lessee')
export class LesseeController {
  constructor(private readonly lesseeService: LesseeService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(@Query() filterLesseeDTO: FilterLesseeDTO): Promise<Lessee[]> {
    return await this.lesseeService.findAll(filterLesseeDTO);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findById(@Param('id') id: string): Promise<Lessee> {
    return await this.lesseeService.findById(id);
  }

  @Get('lesseesbyclient/:clientId')
  @HttpCode(HttpStatus.OK)
  async findByClient(@Param('clientId') clientId: string): Promise<Client> {
    return await this.lesseeService.findByClient(clientId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createLessee(@Body() createLessee: CreateLesseeDTO): Promise<Lessee> {
    return await this.lesseeService.createLessee(createLessee);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async updateLessee(
    @Param('id') id: string,
    @Body() updateLessee: EditLesseeDto,
  ): Promise<Lessee> {
    return await this.lesseeService.updateLessee(id, updateLessee);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteLessee(@Param('id') id: string): Promise<void> {
    return await this.lesseeService.deleteLessee(id);
  }
}
