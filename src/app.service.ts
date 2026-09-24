import { Injectable } from '@nestjs/common';
import type { SsoUser } from '@pedrolucaslopes/sso-client';
import { Health } from './global/dto/health.dto';
import { Session } from './global/dto/session.dto';

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

  health(): Health {
    return {
      status: 'ok',
      service: 'krloc',
      uptime: Math.floor(process.uptime()),
    };
  }
}
