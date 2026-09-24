import { Injectable } from '@nestjs/common';
import { Addressable } from '../types/addressable';
import { compareAddress } from '../utils/compareAddress.utils';
import { NormalizedAddress } from '../types/normalizedAddress';
import { ApiException } from 'src/global/error/apiError';

@Injectable()
export class AddressValidator {
  validate(value: NormalizedAddress, address: Addressable) {
    this.validateField(value.address, address.address);
    this.validateField(value.neighborhood, address?.neighborhood);
    this.validateField(value.city, address?.city);
    this.validateField(value.state, address.state);
  }

  private validateField(value?: string | null, bodyValue?: string | null) {
    if (
      bodyValue &&
      value &&
      compareAddress(bodyValue) !== compareAddress(value)
    ) {
      throw new ApiException('address_mismatch', { value: bodyValue });
    }
  }
}
