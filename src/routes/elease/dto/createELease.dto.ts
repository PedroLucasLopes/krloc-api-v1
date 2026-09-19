import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsString,
  IsUUID,
} from 'class-validator';
import {
  IsDateInRange,
  IsWithinDays,
  MAX_CONTRACT_DAYS,
} from 'src/global/validators/dateRange.validators';
import { IsDateAfter } from 'src/global/validators/isDateAfter.validators';

/**
 * O contrato nasce pendente, e so o ciclo muda isso: situacao e data de
 * fechamento nao vem do corpo. Com elas aqui, um contrato nascia ativo sem o
 * documento assinado, ou concluido sem nenhuma volta, direto no fechamento do mes.
 */
export class CreateELeaseDto {
  @IsString()
  @IsNotEmpty()
  lesseeId: string;

  @IsDateString()
  @IsNotEmpty()
  @IsDateInRange({
    message: 'startDate is out of the accepted range',
    context: { code: 'date_out_of_range' },
  })
  startDate: Date;

  @IsDateString()
  @IsNotEmpty()
  @IsDateAfter('startDate', {
    message: 'endDate cannot be before startDate',
    context: { code: 'end_before_start' },
  })
  @IsDateInRange({
    message: 'endDate is out of the accepted range',
    context: { code: 'date_out_of_range' },
  })
  @IsWithinDays('startDate', MAX_CONTRACT_DAYS, {
    message: 'the contracted period is too long',
    context: { code: 'period_too_long' },
  })
  endDate: Date;

  @IsArray()
  @IsString({ each: true })
  @IsUUID('4', { each: true })
  equipments: string[];
}
