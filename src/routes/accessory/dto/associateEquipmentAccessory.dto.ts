import { IsArray, IsUUID } from 'class-validator';

export class AssociateEquipmentAccessory {
  @IsUUID('4')
  equipmentId: string;

  @IsArray()
  @IsUUID('4', { each: true })
  accessoryIds: string[];
}
