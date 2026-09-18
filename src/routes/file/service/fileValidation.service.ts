import { PipeTransform, Injectable } from '@nestjs/common';
import {
  MAX_UPLOAD_BYTES,
  SPREADSHEET_EXTENSION,
  SPREADSHEET_MIME_TYPES,
} from '../file.constant';
import { ApiException } from 'src/global/error/apiError';

/**
 * Confere o arquivo da importacao antes de ele virar cadastro.
 *
 * O teto de tamanho tambem esta no multer, em `file.module.ts`, e e la que ele
 * de fato protege: aqui o arquivo ja esta inteiro na memoria. Esta conferencia
 * fica como segunda linha, e para dar uma mensagem que a tela sabe traduzir.
 */
@Injectable()
export class FileSizeValidationPipe implements PipeTransform {
  transform(value: Express.Multer.File) {
    if (!value) {
      throw new ApiException('file_missing');
    }

    if (value.size > MAX_UPLOAD_BYTES) {
      throw new ApiException('file_too_large');
    }

    const nome = value.originalname ?? '';
    const tipo = value.mimetype ?? '';

    if (
      !SPREADSHEET_EXTENSION.test(nome) ||
      !SPREADSHEET_MIME_TYPES.has(tipo)
    ) {
      throw new ApiException('file_type_invalid');
    }

    return value;
  }
}
