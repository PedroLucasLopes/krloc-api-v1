import { PartialType } from '@nestjs/mapped-types';
import { CreateLesseeDTO } from './createLessee.dto';

export class EditLesseeDto extends PartialType(CreateLesseeDTO) {}
