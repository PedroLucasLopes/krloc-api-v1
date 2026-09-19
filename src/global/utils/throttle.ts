/**
 * Teto das rotas caras, por origem: 30 chamadas por minuto, contra as 600 do
 * limite geral. Sao as que leem o arquivo inteiro de uma planilha, montam um
 * `.docx` ou percorrem todos os contratos de um mes, e rodam no mesmo processo
 * que atende todo o resto.
 */
export const HEAVY_ROUTE_LIMIT = { default: { limit: 30, ttl: 60_000 } };
