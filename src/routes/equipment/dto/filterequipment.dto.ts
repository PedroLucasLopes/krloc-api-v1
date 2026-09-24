import { IsEnum, IsOptional, IsString } from 'class-validator';
import { StatusEquipment } from 'generated/prisma/enums';
import { PaginationDTO } from 'src/global/dto/PaginationDTO.dto';

export class FilterEquipmentDTO extends PaginationDTO {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  @IsEnum(StatusEquipment)
  status?: StatusEquipment;
}
