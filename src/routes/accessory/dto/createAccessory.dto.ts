import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateAccessory {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @IsNotEmpty()
  quantity: number;

  @IsNumber()
  @IsNotEmpty()
  p_indemnity: number;
}
