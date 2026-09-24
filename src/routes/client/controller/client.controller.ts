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
import { ClientService } from '../service/client.service';
import { FilterClientDTO } from '../dto/filterclient.dto';
import { Client } from 'generated/prisma/client';
import { CreateClientDto } from '../dto/createClient.dto';
import { EditClientDto } from '../dto/editClient.dto';

@Controller('/client')
export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(@Query() filter: FilterClientDTO): Promise<Client[]> {
    return await this.clientService.findAll(filter);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findById(@Param('id') id: string): Promise<Client> {
    return await this.clientService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createClient(
    @Body() createClientDto: CreateClientDto,
  ): Promise<Client> {
    return await this.clientService.createClient(createClientDto);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async updateClient(
    @Param('id') id: string,
    @Body() editClientDto: EditClientDto,
  ): Promise<Client> {
    return await this.clientService.updateClient(id, editClientDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteClient(@Param('id') id: string): Promise<void> {
    return await this.clientService.deleteClient(id);
  }
}
