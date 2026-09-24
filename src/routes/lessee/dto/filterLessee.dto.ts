import { IsOptional, IsString } from 'class-validator';
import { PaginationDTO } from 'src/global/dto/PaginationDTO.dto';

export class FilterLesseeDTO extends PaginationDTO {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  zipcode?: string;

  @IsString()
  @IsOptional()
  city?: string;
}
