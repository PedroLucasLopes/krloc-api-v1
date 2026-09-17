import { Injectable, NotFoundException } from '@nestjs/common';
import { Client } from 'generated/prisma/client';
import { PrismaService } from 'src/global/prisma/prisma.service';
import { PaginationConfig } from 'src/global/utils/pagination.utils';
import { FilterClientDTO } from '../dto/filterclient.dto';
import { CreateClientDto } from '../dto/createClient.dto';
import { EditClientDto } from '../dto/editClient.dto';
import { ZipcodeService } from 'src/global/address/zipcode.service';
import { AddressValidator } from 'src/global/address/address.validator';
import { normalizeApiAddress } from 'src/global/utils/normalizeApiAddress.utils';
import { zipcodeAddress } from 'src/global/utils/zipcodeAddress.utils';

@Injectable()
export class ClientService {
  constructor(
    private prisma: PrismaService,
    private zipcodeService: ZipcodeService,
    private addressValidator: AddressValidator,
  ) {}

  async findAll(filter: FilterClientDTO): Promise<Client[]> {
    const { page, limit } = PaginationConfig(filter);

    const clients = await this.prisma.client.findMany({
      where: {
        ...(filter?.name && {
          name: { contains: filter.name, mode: 'insensitive' },
        }),
        ...(filter?.email && {
          email: { contains: filter.email, mode: 'insensitive' },
        }),
        ...(filter?.taxId && {
          tax_id: { contains: filter.taxId },
        }),
      },
      ...(filter?.order && {
        orderBy: { name: filter.order },
      }),
      include: {
        lessees: true,
      },
      skip: page,
      take: limit,
    });

    if (clients.length === 0) {
      throw new NotFoundException('No clients found');
    }

    return clients;
  }

  async findById(id: string): Promise<Client> {
    const client = await this.prisma.client.findUnique({
      where: { id },
    });

    if (!client) {
      throw new NotFoundException(`Client not found`);
    }

    return client;
  }

  async createClient(data: CreateClientDto): Promise<Client> {
    const zipCode = await this.zipcodeService.getZipcode(data.zipcode);

    this.addressValidator.validate(normalizeApiAddress(zipCode), data);

    const client = await this.prisma.client.create({
      data: {
        ...data,
        ...zipcodeAddress(zipCode, data),
      },
    });

    return client;
  }

  async updateClient(id: string, data: EditClientDto): Promise<Client> {
    const clientExists = await this.prisma.client.findUnique({ where: { id } });

    if (!clientExists) {
      throw new NotFoundException('Client not found');
    }

    const zipcode = data.zipcode?.replace(/-/g, '');
    const zipcodeChanged = !!zipcode && zipcode !== clientExists.zipcode;
    const addressSent = [
      data.address,
      data.neighborhood,
      data.city,
      data.state,
    ].some((field) => field !== undefined);

    const validatedData: EditClientDto = { ...data, zipcode };

    // O endereco enviado e conferido contra a base do CEP, nunca contra o que
    // estava gravado: o gravado pertence ao CEP antigo. Com o mesmo CEP, o que o
    // corpo nao traz continua o gravado; com CEP novo, o gravado nao vale mais.
    if (zipcodeChanged || addressSent) {
      const zipCode = await this.zipcodeService.getZipcode(
        zipcode || clientExists.zipcode,
      );

      this.addressValidator.validate(normalizeApiAddress(zipCode), data);

      Object.assign(
        validatedData,
        zipcodeAddress(
          zipCode,
          zipcodeChanged ? data : { ...clientExists, ...data },
        ),
      );
    }

    const client = await this.prisma.client.update({
      where: { id },
      data: validatedData,
    });

    return client;
  }

  async deleteClient(id: string): Promise<void> {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: { lessees: true },
    });

    if (client && client.lessees.length > 0) {
      throw new NotFoundException(
        'This client has associated lessees and cannot be deleted',
      );
    }

    await this.prisma.client.delete({
      where: { id },
    });
  }
}
