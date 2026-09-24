import { StatusEquipment } from 'generated/prisma/enums';
import { EDITABLE_STATUSES } from './editableStatus';

export const parseStatus = (status?: string): StatusEquipment => {
  const normalized = status?.trim().toUpperCase();

  return (
    EDITABLE_STATUSES.find((editable) => editable === normalized) ??
    StatusEquipment.AVAILABLE
  );
};
