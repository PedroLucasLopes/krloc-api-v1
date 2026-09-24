import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import {
  IsDateInRange,
  IsWithinDays,
  MAX_CONTRACT_DAYS,
} from 'src/global/validators/dateRange.validators';
import { IsDateAfter } from 'src/global/validators/isDateAfter.validators';

export class SimulationEventDto {
  @IsIn(['defect', 'stolen'])
  kind: 'defect' | 'stolen';

  @IsDateString()
  @IsDateInRange({
    message: 'date is out of the accepted range',
    context: { code: 'date_out_of_range' },
  })
  date: string;

  @IsBoolean()
  replaced: boolean;
}

export class SimulationItemDto {
  @IsUUID('4')
  equipmentId: string;

  @IsDateString()
  @IsDateInRange({
    message: 'returnDate is out of the accepted range',
    context: { code: 'date_out_of_range' },
  })
  returnDate: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SimulationEventDto)
  event?: SimulationEventDto;
}

export class SimulationDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ArrayUnique((item: SimulationItemDto) => item.equipmentId)
  @ValidateNested({ each: true })
  @Type(() => SimulationItemDto)
  items: SimulationItemDto[];

  @IsDateString()
  @IsDateInRange({
    message: 'startDate is out of the accepted range',
    context: { code: 'date_out_of_range' },
  })
  startDate: string;

  @IsDateString()
  @IsDateAfter('startDate', {
    message: 'plannedEndDate cannot be before startDate',
    context: { code: 'end_before_start' },
  })
  @IsDateInRange({
    message: 'plannedEndDate is out of the accepted range',
    context: { code: 'date_out_of_range' },
  })
  @IsWithinDays('startDate', MAX_CONTRACT_DAYS, {
    message: 'the contracted period is too long',
    context: { code: 'period_too_long' },
  })
  plannedEndDate: string;
}
