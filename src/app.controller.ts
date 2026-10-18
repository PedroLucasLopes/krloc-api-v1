import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import {
  CurrentToken,
  CurrentUser,
  SsoAuthenticated,
  SsoOptional,
  SsoPublic,
} from '@pedrolucaslopes/sso-client';
import type { SsoUser } from '@pedrolucaslopes/sso-client';
import type { Request } from 'express';
import { AppService } from './app.service';
import { Health } from './global/dto/health.dto';
import { Session } from './global/dto/session.dto';
import { Visitor } from './global/dto/visitor.dto';

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

  @Get('visitor')
  @HttpCode(HttpStatus.OK)
  @SsoOptional()
  visitor(
    @CurrentUser() user: SsoUser | undefined,
    @CurrentToken() token: string | undefined,
    @Req() req: Request,
  ): Visitor {
    return this.appService.visitor(user, token, req.headers.authorization);
  }

  @Post('visitor')
  @HttpCode(HttpStatus.OK)
  @SsoOptional()
  visit(
    @CurrentUser() user: SsoUser | undefined,
    @CurrentToken() token: string | undefined,
    @Req() req: Request,
  ): Visitor {
    return this.appService.visitor(user, token, req.headers.authorization);
  }
}
