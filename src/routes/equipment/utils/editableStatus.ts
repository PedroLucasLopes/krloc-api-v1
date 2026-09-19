import { StatusEquipment } from 'generated/prisma/enums';

/**
 * O que o cadastro de equipamento pode gravar: disponivel, manutencao e roubado.
 * Reservado, locado e substituto sao do contrato, que muda o equipamento junto
 * com o item dele; desativado e o `DELETE`. Com essas situacoes abertas, uma
 * unidade marcada locada fora de contrato ficava presa, e uma reservada voltava a
 * disponivel e entrava em dois contratos.
 */
export const EDITABLE_STATUSES: StatusEquipment[] = [
  StatusEquipment.AVAILABLE,
  StatusEquipment.MAINTENANCE,
  StatusEquipment.STOLEN,
];

/** Situacoes em que o equipamento esta num contrato: so o contrato o muda. */
export const CONTRACT_STATUSES: StatusEquipment[] = [
  StatusEquipment.PENDING,
  StatusEquipment.LEASED,
  StatusEquipment.REPLACE,
];
