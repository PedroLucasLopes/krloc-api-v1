import { StatusEquipment } from 'generated/prisma/enums';
import { EDITABLE_STATUSES } from './editableStatus';

/** Situacao lida da planilha. So as do cadastro valem; o resto vira disponivel. */
export const parseStatus = (status?: string): StatusEquipment => {
  const normalized = status?.trim().toUpperCase();

  return (
    EDITABLE_STATUSES.find((editable) => editable === normalized) ??
    StatusEquipment.AVAILABLE
  );
};
