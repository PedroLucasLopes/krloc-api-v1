import { CreateEquipmentDto } from './createEquipment.dto';
import { PartialType } from '@nestjs/mapped-types';

export class EditEquipmentDto extends PartialType(CreateEquipmentDto) {}
