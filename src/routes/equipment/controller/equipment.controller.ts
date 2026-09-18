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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { EquipmentService } from '../service/equipment.service';
import { Equipment } from 'generated/prisma/client';
import { CreateEquipmentDto } from '../dto/createEquipment.dto';
import { EditEquipmentDto } from '../dto/editEquipment.dto';
import { FilterEquipmentDTO } from '../dto/filterequipment.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { CsvImport } from 'src/global/types/csvImport';
import { FileSizeValidationPipe } from 'src/routes/file/service/fileValidation.service';

@Controller('/equipment')
export class EquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query() FilterEquipmentDTO: FilterEquipmentDTO,
  ): Promise<Equipment[]> {
    return await this.equipmentService.findAll(FilterEquipmentDTO);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findById(@Param('id') id: string): Promise<Equipment> {
    return await this.equipmentService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createEquipment(
    @Body() createEquipmentDto: CreateEquipmentDto,
  ): Promise<Equipment> {
    return await this.equipmentService.createEquipment(createEquipmentDto);
  }

  @Post('upload')
  // Le o arquivo inteiro e grava em lote: e a rota mais cara da API, e a que
  // mais rende a quem so quiser ocupa-la.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async importCsv(
    @UploadedFile(new FileSizeValidationPipe())
    file: Express.Multer.File,
  ): Promise<CsvImport> {
    return await this.equipmentService.importCsv(file);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async editEquipment(
    @Param('id') id: string,
    @Body() data: EditEquipmentDto,
  ): Promise<Equipment> {
    return await this.equipmentService.editEquipment(id, data);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEquipment(@Param('id') id: string): Promise<void> {
    await this.equipmentService.deleteEquipment(id);
  }
}
