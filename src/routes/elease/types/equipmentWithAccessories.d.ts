// So o que buildAccessoryData le: a consulta de createELease traz do acessorio
// apenas id, name e p_indemnity. Escrito a mao, e nao com EquipmentGetPayload,
// porque entre payloads aninhados do Prisma o tsc pode parar de comparar e
// aceitar campo que falta.
export type EquipmentWithAccessories = {
  equipmentAccessories: {
    accessoryId: string;
    accessory: { name: string; p_indemnity: number };
  }[];
};
