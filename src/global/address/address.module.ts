import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ZipcodeService } from './zipcode.service';
import { AddressValidator } from './address.validator';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [ZipcodeService, AddressValidator],
  exports: [ZipcodeService, AddressValidator],
})
export class AddressModule {}
