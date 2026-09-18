import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { LeaseStatus } from 'generated/prisma/client';
import { IsDateAfter } from 'src/global/validators/isDateAfter.validators';

export class CreateELeaseDto {
  @IsString()
  @IsNotEmpty()
  lesseeId: string;

  @IsDateString()
  @IsNotEmpty()
  startDate: Date;

  @IsDateString()
  @IsNotEmpty()
  @IsDateAfter('startDate', {
    message: 'endDate cannot be before startDate',
    context: { code: 'end_before_start' },
  })
  endDate: Date;

  @IsDateString()
  @IsOptional()
  @IsDateAfter('startDate', {
    message: 'finishDate cannot be before startDate',
    context: { code: 'end_before_start' },
  })
  finishDate?: Date;

  @IsEnum(LeaseStatus)
  @IsOptional()
  status?: LeaseStatus;

  @IsArray()
  @IsString({ each: true })
  @IsUUID('4', { each: true })
  equipments: string[];
}
