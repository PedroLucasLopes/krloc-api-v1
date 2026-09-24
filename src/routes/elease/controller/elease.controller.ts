import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ELease, Equipment } from 'generated/prisma/client';
import { ELeaseService } from '../service/elease.service';
import { CreateELeaseDto } from '../dto/createELease.dto';
import { FilterELeaseDto } from '../dto/filterELease.dto';
import { CustomEquipmentInContract } from '../dto/customEquipmentInContract.dto';
import { EquipmentsEditStatus } from '../dto/equipmentsEditStatus.dto';
import { ReplaceEquipmentDto } from '../dto/replaceEquipment.dto';

@Controller('/elease')
export class ELeaseController {
  constructor(private readonly eleaseService: ELeaseService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(@Query() filter: FilterELeaseDto): Promise<ELease[]> {
    return await this.eleaseService.findAll(filter);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findById(@Param('id') id: string): Promise<ELease> {
    return await this.eleaseService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createElease(
    @Body() createEleaseDto: CreateELeaseDto,
  ): Promise<ELease> {
    return await this.eleaseService.createELease(createEleaseDto);
  }

  @Post('start/:id')
  @HttpCode(HttpStatus.OK)
  async startContract(@Param('id') id: string): Promise<ELease> {
    return await this.eleaseService.startContract(id);
  }

  @Post('close/:id')
  @HttpCode(HttpStatus.OK)
  async closeContract(@Param('id') id: string): Promise<ELease> {
    return this.eleaseService.closeContract(id);
  }

  @Post('cancel/:id')
  @HttpCode(HttpStatus.OK)
  async cancelContract(@Param('id') id: string): Promise<ELease> {
    return await this.eleaseService.cancelContract(id);
  }

  @Put('add/:id')
  @HttpCode(HttpStatus.OK)
  async addEquipmentsToContract(
    @Param('id') id: string,
    @Body() equipmentsId: CustomEquipmentInContract,
  ): Promise<ELease> {
    return await this.eleaseService.addEquipmentsToELease(id, equipmentsId);
  }

  @Put('remove/:id')
  @HttpCode(HttpStatus.OK)
  async removeEquipmentsToContract(
    @Param('id') id: string,
    @Body() equipmentsId: CustomEquipmentInContract,
  ): Promise<ELease> {
    return await this.eleaseService.removeEquipmentsToELease(id, equipmentsId);
  }

  @Put('status/:id')
  @HttpCode(HttpStatus.OK)
  setUpdateStatusEquipment(
    @Param('id') id: string,
    @Body() equipmentsId: EquipmentsEditStatus,
  ): Promise<Equipment[]> {
    return this.eleaseService.setUpdateStatusEquipment(id, equipmentsId);
  }

  @Put('replace/:id')
  @HttpCode(HttpStatus.OK)
  async replaceEquipment(
    @Param('id') id: string,
    @Body() equipmentsId: ReplaceEquipmentDto,
  ): Promise<ELease> {
    return await this.eleaseService.replaceEquipment(id, equipmentsId);
  }
}
