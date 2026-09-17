import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { FileSizeValidationPipe } from './service/fileValidation.service';
import { MAX_UPLOAD_BYTES } from './file.constant';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(),
      /*
       * O arquivo fica na memoria do processo, entao o teto precisa valer
       * ANTES de ele ser lido inteiro: sem `limits`, um upload de 1 GB era
       * carregado na memoria e so depois recusado por tamanho. O multer corta
       * o fluxo no limite, e o Nest transforma isso em 413.
       */
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 10 },
    }),
  ],
  providers: [FileSizeValidationPipe],
  exports: [FileSizeValidationPipe],
})
export class FileModule {}
