import { PartialType } from '@nestjs/mapped-types';
import { CreateELeaseDto } from './createELease.dto';

export class EditELeaseDto extends PartialType(CreateELeaseDto) {}
