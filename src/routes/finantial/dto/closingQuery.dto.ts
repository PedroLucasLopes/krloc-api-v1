import { IsOptional, Matches } from 'class-validator';

export class ClosingQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month must be YYYY-MM',
    context: { code: 'month_invalid' },
  })
  month?: string;
}
