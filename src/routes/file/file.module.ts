import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { FileSizeValidationPipe } from './service/fileValidation.service';
import { MAX_UPLOAD_BYTES } from './file.constant';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 10 },
    }),
  ],
  providers: [FileSizeValidationPipe],
  exports: [FileSizeValidationPipe],
})
export class FileModule {}
