import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { StatusEquipment } from 'generated/prisma/enums';

class EquipmentStatusDto {
  @IsString()
  id: string;

  @IsIn([
    StatusEquipment.AVAILABLE,
    StatusEquipment.STOLEN,
    StatusEquipment.MAINTENANCE,
  ])
  status: StatusEquipment;
}

export class EquipmentsEditStatus {
  @IsArray()
  @IsNotEmpty()
  // Sem os dois abaixo o item nao e validado, e qualquer status passava.
  @ValidateNested({ each: true })
  @Type(() => EquipmentStatusDto)
  equipments: EquipmentStatusDto[];
}
