import { Controller, Get, HttpCode, HttpStatus, Req } from '@nestjs/common';
import {
  CurrentToken,
  CurrentUser,
  SsoAuthenticated,
  SsoPublic,
} from '@pedrolucaslopes/sso-client';
import type { SsoUser } from '@pedrolucaslopes/sso-client';
import type { Request } from 'express';
import { AppService } from './app.service';
import { Health } from './global/dto/health.dto';
import { Session } from './global/dto/session.dto';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Liveness do container. Fora da sessao e fora do RBAC. */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  @SsoPublic()
  health(): Health {
    return this.appService.health();
  }

  /**
   * Landing pos-login. Exige sessao, mas nao uma permissao propria: quem
   * chegou ate aqui ja tem acesso ao projeto.
   *
   * Devolve o estado da sessao para o front montar a interface, e serve de
   * prova de que o header chegou ao handler mesmo quando o usuario se
   * identificou por cookie: o guard hidrata o `Authorization` a partir da
   * sessao, entao daqui para baixo existe um caminho so.
   */
  @Get('home')
  @HttpCode(HttpStatus.OK)
  @SsoAuthenticated()
  getHello(
    @CurrentUser() user: SsoUser,
    @CurrentToken() token: string | undefined,
    @Req() req: Request,
  ): Session {
    return this.appService.session(user, token, req.headers.authorization);
  }
}
