import { IsArray, IsNotEmpty, IsUUID } from 'class-validator';

class Replaceable {
  @IsUUID(4, { each: true })
  @IsNotEmpty()
  oldEquipmentId: string;
  @IsUUID(4, { each: true })
  @IsNotEmpty()
  newEquipmentId: string;
}

export class ReplaceEquipmentDto {
  @IsArray()
  @IsNotEmpty()
  replacements: Replaceable[];
}
