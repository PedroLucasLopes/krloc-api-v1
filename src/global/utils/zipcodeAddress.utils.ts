import { Addressable } from '../types/addressable';
import { ZipcodeInfo } from '../types/zipcodevalidator';
import { ApiException } from 'src/global/error/apiError';

/**
 * O endereco que se grava com um CEP: o que a base tem vence, e o que ela deixa
 * vazio sai de `data`. `||`, e nao `??`: para CEP sem logradouro ou sem bairro a
 * base devolve string vazia, nao `null`, e a string vazia venceria o digitado.
 *
 * Rua e cidade sao obrigatorias no banco. Se nem a base nem `data` trazem, a
 * gravacao e recusada, em vez de guardar vazio ou manter o endereco de outro CEP.
 */
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
