import { CreateClientDto } from './createClient.dto';
import { PartialType } from '@nestjs/mapped-types';

export class EditClientDto extends PartialType(CreateClientDto) {}
