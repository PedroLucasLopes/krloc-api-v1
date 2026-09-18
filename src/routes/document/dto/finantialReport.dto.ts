import { IsDateString, IsNotEmpty } from 'class-validator';
import { IsDateAfter } from 'src/global/validators/isDateAfter.validators';

export class FinantialReportDto {
  @IsDateString()
  @IsNotEmpty()
  startDate: Date;

  @IsDateString()
  @IsDateAfter('startDate', {
    message: 'endDate cannot be before startDate',
    context: { code: 'end_before_start' },
  })
  endDate: Date;
}
