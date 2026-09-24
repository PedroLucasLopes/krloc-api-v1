import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/global/prisma/prisma.module';
import { ClientController } from './controller/client.controller';
import { ClientService } from './service/client.service';
import { AddressModule } from 'src/global/address/address.module';

@Module({
  imports: [PrismaModule, AddressModule],
  controllers: [ClientController],
  providers: [ClientService],
})
export class ClientModule {}
