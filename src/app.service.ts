import { Injectable } from '@nestjs/common';
import type { SsoUser } from '@pedrolucaslopes/sso-client';
import { Health } from './global/dto/health.dto';
import { Session } from './global/dto/session.dto';
import { Visitor } from './global/dto/visitor.dto';

@Injectable()
export class AppService {
  session(
    user: SsoUser,
    token: string | undefined,
    authorizationHeader: string | undefined,
  ): Session {
    return {
      message: `Logado como ${user.name}`,
      user: { id: user.id, name: user.name, email: user.email },
      permissions: user.permissions.length,
      tokenAvailable: Boolean(token),
      authorizationHeader: authorizationHeader?.startsWith('Bearer ') === true,
    };
  }

  visitor(
    user: SsoUser | undefined,
    token: string | undefined,
    authorizationHeader: string | undefined,
  ): Visitor {
    return {
      signedIn: Boolean(user),
      user: user ? { id: user.id, name: user.name, email: user.email } : null,
      permissions: user?.permissions.length ?? 0,
      tokenAvailable: Boolean(token),
      authorizationHeader: authorizationHeader?.startsWith('Bearer ') === true,
    };
  }

  health(): Health {
    return {
      status: 'ok',
      service: 'krloc',
      uptime: Math.floor(process.uptime()),
    };
  }
}
