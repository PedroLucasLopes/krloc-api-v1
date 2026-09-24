import { StatusEquipment } from 'generated/prisma/enums';

export const EDITABLE_STATUSES: StatusEquipment[] = [
  StatusEquipment.AVAILABLE,
  StatusEquipment.MAINTENANCE,
  StatusEquipment.STOLEN,
];

export const CONTRACT_STATUSES: StatusEquipment[] = [
  StatusEquipment.PENDING,
  StatusEquipment.LEASED,
  StatusEquipment.REPLACE,
];
