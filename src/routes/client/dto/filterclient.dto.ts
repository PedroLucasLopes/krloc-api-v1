import { IsEmail, IsOptional, IsString } from 'class-validator';
import { PaginationDTO } from 'src/global/dto/PaginationDTO.dto';

export class FilterClientDTO extends PaginationDTO {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @IsOptional()
  taxId?: string;
}
