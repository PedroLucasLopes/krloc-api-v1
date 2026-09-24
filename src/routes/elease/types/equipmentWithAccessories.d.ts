export type EquipmentWithAccessories = {
  equipmentAccessories: {
    accessoryId: string;
    accessory: { name: string; p_indemnity: number };
  }[];
};
