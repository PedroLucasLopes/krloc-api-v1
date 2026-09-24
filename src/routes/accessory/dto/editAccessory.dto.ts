import { PartialType } from '@nestjs/mapped-types';
import { CreateAccessory } from './createAccessory.dto';

export class EditAccessory extends PartialType(CreateAccessory) {}
