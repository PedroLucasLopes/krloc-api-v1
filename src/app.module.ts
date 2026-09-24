import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { SsoClientModule } from '@pedrolucaslopes/sso-client';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './global/prisma/prisma.module';
import { PrismaExceptionFilter } from './global/error/prismaclientknownerror.exception';
import { PrismaExceptionValidationFilter } from './global/error/prismacientvalidationerror.exception';

import { EquipmentModule } from './routes/equipment/equipment.module';
import { ClientModule } from './routes/client/client.module';
import { LesseeModule } from './routes/lessee/lessee.module';
import { ELeaseModule } from './routes/elease/elease.module';
import { DocumentModule } from './routes/document/document.module';
import { FinantialModule } from './routes/finantial/finantial.module';
import { AccessoryModule } from './routes/accessory/accessory.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 600 }],
    }),
    SsoClientModule.forRootFromEnv(),
    HttpModule,
    PrismaModule,
    EquipmentModule,
    ClientModule,
    LesseeModule,
    ELeaseModule,
    DocumentModule,
    FinantialModule,
    AccessoryModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
    { provide: APP_FILTER, useClass: PrismaExceptionValidationFilter },
  ],
})
export class AppModule {}
