import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { APP_FILTER } from '@nestjs/core';
import { SsoClientModule } from '@pedrolucaslopes/sso-client';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './global/prisma/prisma.module';
import { PrismaExceptionFilter } from './global/error/prismaclientknownerror.exception';

import { EquipmentModule } from './routes/equipment/equipment.module';
import { ClientModule } from './routes/client/client.module';
import { LesseeModule } from './routes/lessee/lessee.module';
import { ELeaseModule } from './routes/elease/elease.module';
import { DocumentModule } from './routes/document/document.module';
import { FinantialModule } from './routes/finantial/finantial.module';
import { AccessoryModule } from './routes/accessory/accessory.module';

/**
 * Toda a autenticacao vem de @pedrolucaslopes/sso-client, numa linha. O modulo
 * le as variaveis de ambiente do ecossistema (identidade do SSO, client id,
 * chave privada, base publica e cookies; ver `.env.example`), registra o fluxo
 * OAuth, a sessao em cookie cifrado, a verificacao contra o JWKS, o RBAC por
 * rota e o cookie-parser, e instala um guard global.
 *
 * Consequencia: rota nova nasce protegida. Para abrir, use `@SsoPublic()` ou
 * `@SsoAuthenticated()` do pacote.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
