import { IsOptional, IsString } from 'class-validator';
import { PaginationDTO } from 'src/global/dto/PaginationDTO.dto';

export class FilterAccessory extends PaginationDTO {
  @IsString()
  @IsOptional()
  name?: string;
}
