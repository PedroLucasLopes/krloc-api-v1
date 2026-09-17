/** Teto do upload de planilha, em bytes. O nginx do front recusa acima de 3 MB. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/** A importacao le CSV, e so. */
export const SPREADSHEET_EXTENSION = /\.csv$/i;

/**
 * Tipos que os navegadores declaram para um CSV. O Windows manda como planilha
 * do Excel, e alguns mandam `application/octet-stream` ou nada.
 *
 * Nem a extensao nem o tipo declarado sao prova: quem envia escolhe os dois.
 * Eles filtram engano, e quem de fato decide e o parser de CSV, que le o
 * conteudo. O que a lista evita e a planilha inteira virar linha de cadastro
 * por causa de um arquivo trocado.
 */
export const SPREADSHEET_MIME_TYPES = new Set([
  'text/csv',
  'application/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/octet-stream',
  '',
]);
