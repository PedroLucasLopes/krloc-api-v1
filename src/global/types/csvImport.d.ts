import { HttpStatus } from '@nestjs/common';

export interface CsvImport {
  message: string;
  registers: number;
  statusCode: HttpStatus;
}
