import { PaginationDTO } from 'src/global/dto/PaginationDTO.dto';

type PaginationType = {
  page: number;
  limit: number;
};

/**
 * Teto do `limit`. Sem ele, `?limit=1000000` devolve a tabela inteira numa
 * resposta so: e varredura de dados e e negacao de servico pelo mesmo pedido.
 * O piso continua 10, e 500 e o que o front pede nas consultas de apoio.
 */
export const MAX_LIMIT = 500;

export const PaginationConfig = (
  paginationDto?: PaginationDTO,
): PaginationType => {
  const paginationRegister = numberFormatter(paginationDto?.page);
  const paginationInterval = Math.min(
    numberFormatter(1, 10, paginationDto?.limit),
    MAX_LIMIT,
  );

  const limit = Number(paginationInterval) || 10;
  const page =
    ((Number(paginationRegister) || 1) - 1) *
    (Number(paginationInterval) || 10);

  return { page, limit };
};

const numberFormatter = (
  limit: number = 1,
  min: number = 1,
  max?: number,
): number => {
  return Math.max(Number(max) || limit, min);
};
