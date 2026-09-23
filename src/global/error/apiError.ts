import { HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

interface ApiErrorDefinition {
  status: HttpStatus;
  message: string;
}

/**
 * O contrato de erro da API. Todo erro da aplicacao sai com um codigo estavel
 * no campo `error`, e e por ele que o front escolhe o texto, na lingua da tela:
 *
 *   { "statusCode": 404, "error": "equipment_not_found", "message": "Equipment not found" }
 *
 * - **`error` e o contrato.** Codigo novo e acrescimo; renomear ou tirar um
 *   quebra o front que o traduz.
 * - **`message` e para quem le a resposta crua**, como o `detail` da RFC 9457
 *   secao 3.1.4. Nenhum front a mostra, e ela nunca carrega valor vindo da
 *   requisicao nem detalhe interno.
 * - **Valor que a tela precisa mostrar vai num membro proprio**, como `status`
 *   ou `equipments` (RFC 9457 secao 3.2), e nunca dentro do texto.
 *
 * Erro que o framework gera sozinho, como o 404 de caminho que nao existe, o
 * 413 do upload e o 429 do limite de requisicoes, fica como o Nest o escreve:
 * o front o reconhece pelo status.
 */
export const API_ERRORS = {
  // gerais
  no_results: { status: HttpStatus.NOT_FOUND, message: 'No records found' },
  validation_failed: {
    status: HttpStatus.BAD_REQUEST,
    message: 'The values sent were refused',
  },
  duplicate: {
    status: HttpStatus.CONFLICT,
    message: 'A record with these values already exists',
  },
  internal_error: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'Internal server error',
  },

  // endereco
  zipcode_not_found: {
    status: HttpStatus.NOT_FOUND,
    message: 'Zipcode not found',
  },
  address_required: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Address is required for this zipcode',
  },
  address_mismatch: {
    status: HttpStatus.BAD_REQUEST,
    message: 'The address does not match the zipcode',
  },

  // arquivo
  file_missing: { status: HttpStatus.BAD_REQUEST, message: 'No file uploaded' },
  file_too_large: {
    status: HttpStatus.BAD_REQUEST,
    message: 'File size exceeds the 2MB limit',
  },
  file_type_invalid: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Only .csv files are accepted',
  },

  // equipamento
  equipment_not_found: {
    status: HttpStatus.NOT_FOUND,
    message: 'Equipment not found',
  },
  equipment_leased: {
    status: HttpStatus.NOT_FOUND,
    message: 'Equipment not found or leased',
  },
  equipment_code_too_short: {
    status: HttpStatus.BAD_REQUEST,
    message: 'The code needs at least 3 characters',
  },
  equipment_code_prefix: {
    status: HttpStatus.BAD_REQUEST,
    message: 'The code has to start with KR',
  },
  equipment_unavailable: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Some equipment is not available',
  },
  equipment_retired: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Retired equipment only comes back by reactivation',
  },
  equipment_not_retired: {
    status: HttpStatus.BAD_REQUEST,
    message: 'The equipment is not retired',
  },
  equipment_reserved: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Some equipment was already reserved',
  },
  equipment_not_leased: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Some equipment is not leased in this contract',
  },

  // acessorio
  accessory_not_found: {
    status: HttpStatus.NOT_FOUND,
    message: 'Accessory not found',
  },
  accessories_unavailable: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Some accessories are not available',
  },
  accessory_quantity_decrease: {
    status: HttpStatus.BAD_REQUEST,
    message: 'The quantity cannot go below the units in use',
  },
  accessory_in_use: {
    status: HttpStatus.BAD_REQUEST,
    message: 'The accessory is associated with equipment',
  },

  // cliente e obra
  client_not_found: {
    status: HttpStatus.NOT_FOUND,
    message: 'Client not found',
  },
  client_has_lessees: {
    status: HttpStatus.CONFLICT,
    message: 'The client has lessees and cannot be deleted',
  },
  lessee_not_found: {
    status: HttpStatus.NOT_FOUND,
    message: 'Lessee not found',
  },
  lessee_owner_change: {
    status: HttpStatus.BAD_REQUEST,
    message: 'A lessee cannot change its client',
  },
  lessee_has_contracts: {
    status: HttpStatus.BAD_REQUEST,
    message: 'The lessee has contracts',
  },

  // contrato
  contract_not_found: {
    status: HttpStatus.NOT_FOUND,
    message: 'Contract not found',
  },
  contract_not_active: {
    status: HttpStatus.NOT_FOUND,
    message: 'Active contract not found',
  },
  contract_not_pending: {
    status: HttpStatus.BAD_REQUEST,
    message: 'The contract is not pending',
  },
  contract_in_state: {
    status: HttpStatus.BAD_REQUEST,
    message: 'The contract state does not allow this operation',
  },
  contract_equipment_not_reserved: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Some equipment in this contract is not pending',
  },
  contract_document_missing: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Generate the contract document before starting',
  },
  contract_last_equipment: {
    status: HttpStatus.BAD_REQUEST,
    message: 'The contract has only one equipment',
  },
  contract_items_out: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Some equipment has not been returned yet',
  },
  period_too_long: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'The period is longer than billing allows',
  },
  no_activity_in_period: {
    status: HttpStatus.BAD_REQUEST,
    message: 'No equipment activity found for this period',
  },

  // substituicao
  replace_duplicate: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Duplicate equipment ids in replacements',
  },
  replace_old_state: {
    status: HttpStatus.BAD_REQUEST,
    message:
      'The replaced equipment must be in MAINTENANCE or STOLEN in this contract',
  },
  replace_new_unavailable: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Some replacement equipment is not available',
  },
  replace_pair: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Could not resolve an equipment pair',
  },
  replace_type_mismatch: {
    status: HttpStatus.BAD_REQUEST,
    message: 'The replacement must have the same equipment code',
  },
  replace_same_unit: {
    status: HttpStatus.BAD_REQUEST,
    message: 'The replacement must be another unit',
  },
  replace_accessories: {
    status: HttpStatus.BAD_REQUEST,
    message: 'The replacement is missing accessories',
  },
} as const satisfies Record<string, ApiErrorDefinition>;

export type ApiErrorCode = keyof typeof API_ERRORS;

/**
 * Membros extras do corpo, com o que a tela precisa para montar o texto. So
 * valor seguro de mostrar: nada de detalhe interno.
 */
export type ApiErrorExtensions = Record<string, unknown>;

/** O corpo do erro. Os membros fixos vencem qualquer extensao de mesmo nome. */
export function apiErrorBody(
  code: ApiErrorCode,
  extensions: ApiErrorExtensions = {},
): Record<string, unknown> {
  const { status, message } = API_ERRORS[code];

  return { ...extensions, statusCode: status, error: code, message };
}

/** Para filtros, que escrevem a resposta sem passar por exception. */
export function sendApiError(
  response: Response,
  code: ApiErrorCode,
  extensions?: ApiErrorExtensions,
): void {
  response.status(API_ERRORS[code].status).json(apiErrorBody(code, extensions));
}

export class ApiException extends HttpException {
  constructor(
    readonly code: ApiErrorCode,
    extensions?: ApiErrorExtensions,
  ) {
    super(apiErrorBody(code, extensions), API_ERRORS[code].status);
  }
}
