import { HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

interface ApiErrorDefinition {
  status: HttpStatus;
  message: string;
}

export const API_ERRORS = {
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

  file_missing: { status: HttpStatus.BAD_REQUEST, message: 'No file uploaded' },
  file_too_large: {
    status: HttpStatus.BAD_REQUEST,
    message: 'File size exceeds the 2MB limit',
  },
  file_type_invalid: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Only .csv files are accepted',
  },

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
  document_template_missing: {
    status: HttpStatus.FAILED_DEPENDENCY,
    message: 'No document template loaded for this kind',
  },
  document_template_invalid: {
    status: HttpStatus.FAILED_DEPENDENCY,
    message: 'The loaded document template is not usable',
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

export type ApiErrorExtensions = Record<string, unknown>;

export function apiErrorBody(
  code: ApiErrorCode,
  extensions: ApiErrorExtensions = {},
): Record<string, unknown> {
  const { status, message } = API_ERRORS[code];

  return { ...extensions, statusCode: status, error: code, message };
}

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
