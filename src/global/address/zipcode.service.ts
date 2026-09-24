import { firstValueFrom } from 'rxjs';
import { ZipcodeInfo } from '../types/zipcodevalidator';
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ApiException } from 'src/global/error/apiError';

@Injectable()
export class ZipcodeService {
  private zipcodeApi: string;
  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.zipcodeApi = this.config.getOrThrow('ZIPCODE_API_URL');
  }

  async getZipcode(zipcode: string): Promise<ZipcodeInfo> {
    const digitsOnly = zipcode.replace(/\D/g, '');

    if (digitsOnly.length !== 8) {
      throw new ApiException('zipcode_not_found');
    }

    const { data } = await firstValueFrom(
      this.httpService.get<ZipcodeInfo>(
        `${this.zipcodeApi}/${digitsOnly}/json/`,
      ),
    );

    if (!data || data.erro) {
      throw new ApiException('zipcode_not_found');
    }

    return {
      ...data,
      cep: data.cep.replace(/-/g, ''),
    };
  }
}
