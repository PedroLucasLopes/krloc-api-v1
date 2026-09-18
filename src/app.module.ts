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
    /*
     * Limite de requisicoes por origem, para disponibilidade: uma origem nao
     * ocupa a API nem o banco sozinha. O teto e alto porque uma tela faz varias
     * chamadas; a importacao de planilha, que le arquivo e grava em lote, tem
     * limite proprio no controller.
     *
     * A contagem e por processo, em memoria, e o IP so e o de quem pediu com
     * `TRUST_PROXY` ligado (ver `main.ts`): atras do nginx do front, sem isso,
     * todo mundo conta como o proxy.
     */
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
    // Antes do guard do sso-client: enxurrada sem sessao para no limite.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Erro do Prisma vira codigo; o texto dele, que traz a consulta, fica no log.
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
    { provide: APP_FILTER, useClass: PrismaExceptionValidationFilter },
  ],
})
export class AppModule {}
