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

  @Get('health')
  @HttpCode(HttpStatus.OK)
  @SsoPublic()
  health(): Health {
    return this.appService.health();
  }

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
