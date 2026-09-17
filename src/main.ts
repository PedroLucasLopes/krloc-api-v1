import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './global/error/prismaclientknownerror.exception';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { PerformanceInterceptor } from './global/interceptors/performance.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  /*
   * Cabecalhos de seguranca. Daqui sai JSON, `.docx` e o documento do bounce do
   * login; nenhum deles carrega script proprio, entao a politica e fechada. O
   * front tem a politica dele, no nginx.
   */
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'none'"],
          'frame-ancestors': ["'none'"],
          'base-uri': ["'none'"],
          'form-action': ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'same-origin' },
      // `SAMEORIGIN` e o padrao do helmet; aqui nada precisa ser embutido, nem
      // pela propria origem. O `frame-ancestors` acima diz o mesmo aos
      // navegadores atuais, e este cobre os antigos.
      frameguard: { action: 'deny' },
    }),
  );

  // Anunciar a stack so ajuda quem procura alvo por versao conhecida.
  app.disable('x-powered-by');

  /*
   * Atras do nginx do front, o IP de quem pediu chega em `X-Forwarded-For`.
   * `TRUST_PROXY` diz quantos saltos confiar; sem ela, no limite de requisicoes
   * todo mundo conta como o proxy. Ligar sem proxy na frente deixaria qualquer
   * um escolher o proprio IP.
   */
  const trustProxy = process.env.TRUST_PROXY?.trim();

  if (trustProxy) {
    app.set('trust proxy', Number(trustProxy) || trustProxy);
  }

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new PrismaExceptionFilter());
  // Sem `cookie-parser` aqui: o SsoClientModule registra o dele.
  app.useGlobalInterceptors(new PerformanceInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
