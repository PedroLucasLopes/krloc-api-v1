import { NormalizedAddress } from '../types/normalizedAddress';
import { ZipcodeInfo } from '../types/zipcodevalidator';

export const normalizeApiAddress = (api: ZipcodeInfo): NormalizedAddress => {
  return {
    address: api.logradouro,
    neighborhood: api.bairro,
    city: api.localidade,
    state: api.uf,
  };
};
