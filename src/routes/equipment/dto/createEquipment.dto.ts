import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { StatusEquipment } from 'generated/prisma/enums';
import { EDITABLE_STATUSES } from '../utils/editableStatus';

export class CreateEquipmentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsNumber()
  @IsNotEmpty()
  p_diary: number;

  @IsNumber()
  @IsOptional()
  p_weekly?: number;

  @IsNumber()
  @IsOptional()
  p_biweekly?: number;

  @IsNumber()
  @IsOptional()
  p_monthly?: number;

  @IsNumber()
  @IsNotEmpty()
  p_indemnity: number;

  @IsOptional()
  @IsIn(EDITABLE_STATUSES)
  status?: StatusEquipment;
}
