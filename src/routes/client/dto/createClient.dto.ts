import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsPostalCode,
  IsString,
  IsTaxId,
  Length,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateClientDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @IsOptional()
  @IsPhoneNumber('BR', {
    message: 'Please enter a valid phone number',
    context: { code: 'phone_invalid' },
  })
  @MinLength(9, {
    message: 'Phone number must be at least 10 characters long',
    context: { code: 'phone_invalid' },
  })
  phone?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10, {
    message: 'Tax ID must be at least 11 characters long',
    context: { code: 'tax_id_invalid' },
  })
  @IsTaxId('pt-BR', {
    message: 'Please enter a valid tax ID',
    context: { code: 'tax_id_invalid' },
  })
  tax_id: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsInt()
  @IsOptional()
  number: number;

  @IsString()
  @IsNotEmpty()
  @IsPostalCode('BR', {
    message: 'Zipcode must be a valid Brazilian postal code',
    context: { code: 'zipcode_invalid' },
  })
  @MinLength(8, {
    message: 'Zipcode must be at least 8 characters long',
    context: { code: 'zipcode_invalid' },
  })
  zipcode: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  neighborhood?: string;

  @IsString()
  @IsOptional()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/, {
    message: 'The state has to be no longer 2 characters',
    context: { code: 'state_invalid' },
  })
  state?: string;
}
