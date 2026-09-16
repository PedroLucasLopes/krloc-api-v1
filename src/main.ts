import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './global/error/prismaclientknownerror.exception';
import { ValidationPipe } from '@nestjs/common';
import { PerformanceInterceptor } from './global/interceptors/performance.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
