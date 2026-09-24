import { IsDate, IsEnum, IsOptional, IsString } from 'class-validator';
import { LeaseStatus } from 'generated/prisma/enums';
import { PaginationDTO } from 'src/global/dto/PaginationDTO.dto';

export class FilterELeaseDto extends PaginationDTO {
  @IsString()
  @IsOptional()
  lesseeId?: string;

  @IsDate()
  @IsOptional()
  startDate?: Date;

  @IsDate()
  @IsOptional()
  endDate?: Date;

  @IsEnum(LeaseStatus)
  @IsOptional()
  status?: LeaseStatus;

  @IsOptional()
  @IsString()
  equipmentName?: string;
}
