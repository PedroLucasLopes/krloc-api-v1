import { PipeTransform, Injectable } from '@nestjs/common';
import {
  MAX_UPLOAD_BYTES,
  SPREADSHEET_EXTENSION,
  SPREADSHEET_MIME_TYPES,
} from '../file.constant';
import { ApiException } from 'src/global/error/apiError';

@Injectable()
export class FileSizeValidationPipe implements PipeTransform {
  transform(value: Express.Multer.File) {
    if (!value) {
      throw new ApiException('file_missing');
    }

    if (value.size > MAX_UPLOAD_BYTES) {
      throw new ApiException('file_too_large');
    }

    const name = value.originalname ?? '';
    const kind = value.mimetype ?? '';

    if (
      !SPREADSHEET_EXTENSION.test(name) ||
      !SPREADSHEET_MIME_TYPES.has(kind)
    ) {
      throw new ApiException('file_type_invalid');
    }

    return value;
  }
}
