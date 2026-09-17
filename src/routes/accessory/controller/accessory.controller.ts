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
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { AccessoryService } from '../service/accessory.service';
import { Accessory } from 'generated/prisma/client';
import { FilterAccessory } from '../dto/filterAccessory.dto';
import { PrismaExceptionValidationFilter } from 'src/global/error/prismacientvalidationerror.exception';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileSizeValidationPipe } from 'src/routes/file/service/fileValidation.service';
import { CsvImport } from 'src/global/types/csvImport';
import { EditAccessory } from '../dto/editAccessory.dto';
import { CreateAccessory } from '../dto/createAccessory.dto';
import { AssociateEquipmentAccessory } from '../dto/associateEquipmentAccessory.dto';
import { EquipmentAccessoryCreated } from '../dto/equipmentAccessoryCreated.dto';

@Controller('accessory')
export class AccessoryController {
  constructor(private readonly accessoryService: AccessoryService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(@Query() filter: FilterAccessory): Promise<Accessory[]> {
    return await this.accessoryService.findAll(filter);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findById(@Param('id') id: string): Promise<Accessory> {
    return await this.accessoryService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseFilters(new PrismaExceptionValidationFilter())
  async createAccessory(@Body() data: CreateAccessory): Promise<Accessory> {
    return await this.accessoryService.createAccessory(data);
  }

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async importCsv(
    @UploadedFile(new FileSizeValidationPipe())
    file: Express.Multer.File,
  ): Promise<CsvImport> {
    return await this.accessoryService.importCsv(file);
  }

  @Post('associate')
  @HttpCode(HttpStatus.CREATED)
  @UseFilters(new PrismaExceptionValidationFilter())
  async associateEquipmentsToAccessory(
    @Body() data: AssociateEquipmentAccessory,
  ): Promise<EquipmentAccessoryCreated> {
    return await this.accessoryService.associateEquipmentsToAccessory(data);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async updateAccessory(
    @Param('id') id: string,
    @Body() data: EditAccessory,
  ): Promise<Accessory> {
    return await this.accessoryService.updateAccessory(id, data);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccessory(@Param('id') id: string): Promise<void> {
    return await this.accessoryService.deleteAccessory(id);
  }
}
