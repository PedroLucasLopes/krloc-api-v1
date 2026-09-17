import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/global/prisma/prisma.service';
import { FilterLesseeDTO } from '../dto/filterLessee.dto';
import { Client, Lessee } from 'generated/prisma/client';
import { PaginationConfig } from 'src/global/utils/pagination.utils';
import { CreateLesseeDTO } from '../dto/createLessee.dto';
import { EditLesseeDto } from '../dto/editLessee.dto';
import { ZipcodeService } from 'src/global/address/zipcode.service';
import { AddressValidator } from 'src/global/address/address.validator';
import { normalizeApiAddress } from 'src/global/utils/normalizeApiAddress.utils';
import { zipcodeAddress } from 'src/global/utils/zipcodeAddress.utils';

@Injectable()
export class LesseeService {
  constructor(
    private prisma: PrismaService,
    private zipcodeService: ZipcodeService,
    private addressValidator: AddressValidator,
  ) {}

  async findAll(filter?: FilterLesseeDTO): Promise<Lessee[]> {
    const { page, limit } = PaginationConfig(filter);

    const lessees = await this.prisma.lessee.findMany({
      where: {
        ...(filter?.name && {
          name: { contains: filter.name, mode: 'insensitive' },
        }),
        ...(filter?.address && {
          address: { contains: filter.address, mode: 'insensitive' },
        }),
        ...(filter?.zipcode && {
          zipcode: { contains: filter.zipcode, mode: 'insensitive' },
        }),
        ...(filter?.city && {
          city: { contains: filter.city, mode: 'insensitive' },
        }),
      },
      include: { eleases: true, client: true },
      skip: page,
      take: limit,
      orderBy: { name: filter?.order },
    });

    if (lessees.length === 0) {
      throw new NotFoundException('No lessees found');
    }

    return lessees;
  }

  async findById(id: string): Promise<Lessee> {
    const lessee = await this.prisma.lessee.findUnique({
      where: { id },
      include: { eleases: true, client: true },
    });

    if (!lessee) {
      throw new NotFoundException('This lessee does not exist');
    }

    return lessee;
  }

  async findByClient(clientId: string): Promise<Client> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: { lessees: true },
    });

    if (!client) {
      throw new NotFoundException('This client does not exist');
    }

    if (client?.lessees.length === 0) {
      throw new NotFoundException(`${client.name} does not have any lessees`);
    }

    return client;
  }

  async createLessee(data: CreateLesseeDTO): Promise<Lessee> {
    const clientIdExists = await this.prisma.client.findUnique({
      where: { id: data.clientId },
    });

    if (!clientIdExists) {
      throw new BadRequestException('This client does not exist!');
    }

    const zipCode = await this.zipcodeService.getZipcode(data.zipcode);

    this.addressValidator.validate(normalizeApiAddress(zipCode), data);

    const createLessee = await this.prisma.lessee.create({
      data: {
        ...data,
        ...zipcodeAddress(zipCode, data),
        clientId: clientIdExists.id,
      },
    });

    return createLessee;
  }

  async updateLessee(id: string, data: EditLesseeDto): Promise<Lessee> {
    const lesseeExists = await this.prisma.lessee.findUnique({
      where: { id },
    });

    if (!lesseeExists) {
      throw new BadRequestException('This lessee does not exist!');
    }

    if (data.clientId) {
      const clientExists = await this.prisma.client.findUnique({
        where: { id: data.clientId },
      });

      if (!clientExists) {
        throw new NotFoundException('Client Not Found!');
      }

      // Mandar o cliente atual e aceito; so a troca de dono e recusada.
      if (clientExists.id !== lesseeExists.clientId) {
        throw new BadRequestException('Lessee cant change of owner');
      }
    }

    const zipcode = data.zipcode?.replace(/-/g, '');
    const zipcodeChanged = !!zipcode && zipcode !== lesseeExists.zipcode;
    const addressSent = [
      data.address,
      data.neighborhood,
      data.city,
      data.state,
    ].some((field) => field !== undefined);

    const validatedData: EditLesseeDto = { ...data, zipcode };

    // O endereco enviado e conferido contra a base do CEP, nunca contra o que
    // estava gravado: o gravado pertence ao CEP antigo. Com o mesmo CEP, o que o
    // corpo nao traz continua o gravado; com CEP novo, o gravado nao vale mais.
    if (zipcodeChanged || addressSent) {
      const zipCode = await this.zipcodeService.getZipcode(
        zipcode || lesseeExists.zipcode,
      );

      this.addressValidator.validate(normalizeApiAddress(zipCode), data);

      Object.assign(
        validatedData,
        zipcodeAddress(
          zipCode,
          zipcodeChanged ? data : { ...lesseeExists, ...data },
        ),
      );
    }

    const editLessee = this.prisma.lessee.update({
      where: { id },
      data: validatedData,
    });

    return editLessee;
  }

  async deleteLessee(id: string): Promise<void> {
    const lessee = await this.prisma.lessee.findUnique({
      where: { id },
      include: { _count: { select: { eleases: true } } },
    });

    if (!lessee) {
      throw new NotFoundException('This lessee does not exist');
    }

    // Contrato encerrado tambem conta: o historico dele aponta para a obra.
    if (lessee._count.eleases > 0) {
      throw new BadRequestException('This lessee have an ongoing contract');
    }

    await this.prisma.lessee.delete({ where: { id } });
  }
}
