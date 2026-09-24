import { Addressable } from '../types/addressable';
import { ZipcodeInfo } from '../types/zipcodevalidator';
import { ApiException } from 'src/global/error/apiError';

export const zipcodeAddress = (zipCode: ZipcodeInfo, data: Addressable) => {
  const address = zipCode.logradouro || data.address;
  const city = zipCode.localidade || data.city;

  if (!address || !city) {
    throw new ApiException('address_required');
  }

  return {
    zipcode: zipCode.cep,
    address,
    city,
    neighborhood: zipCode.bairro || data.neighborhood || null,
    state: zipCode.uf || data.state || null,
  };
};
