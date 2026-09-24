import { HttpStatus } from '@nestjs/common';
import { IsEnum, IsInt, IsString } from 'class-validator';

export class EquipmentAccessoryCreated {
  @IsString()
  message: string;

  @IsInt()
  registers: number;

  @IsEnum(HttpStatus)
  statusCode: HttpStatus;
}
