import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { StatusEquipment } from 'generated/prisma/enums';
import { EDITABLE_STATUSES } from '../utils/editableStatus';

export class CreateEquipmentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsNumber()
  @IsNotEmpty()
  p_diary: number;

  @IsNumber()
  @IsOptional()
  p_weekly?: number;

  @IsNumber()
  @IsOptional()
  p_biweekly?: number;

  @IsNumber()
  @IsOptional()
  p_monthly?: number;

  @IsNumber()
  @IsNotEmpty()
  p_indemnity: number;

  /*
   * Reservado, locado e substituto sao do contrato; desativado e o DELETE, e so
   * a reativacao tira dele.
   *
   * Sem valor padrao aqui de proposito: o `PartialType` do `EditEquipmentDto`
   * herda o inicializador desta classe, e um `AVAILABLE` padrao chegava ao
   * `update` em toda edicao que nao mandasse a situacao. Mexer no nome de um
   * equipamento em manutencao o deixava disponivel, e um desativado voltava
   * calado a frota. Sem ela, o cadastro nasce disponivel pelo padrao da coluna e
   * a edicao mantem a situacao gravada.
   */
  @IsOptional()
  @IsIn(EDITABLE_STATUSES)
  status?: StatusEquipment;
}
