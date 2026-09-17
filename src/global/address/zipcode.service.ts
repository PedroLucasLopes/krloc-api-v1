import { firstValueFrom } from 'rxjs';
import { ZipcodeInfo } from '../types/zipcodevalidator';
import { Injectable, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

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
    /*
     * O CEP vem do corpo da requisicao e entra no CAMINHO da URL da base
     * externa. Os DTOs so exigem oito caracteres, entao aqui ele e reduzido aos
     * digitos: sem isso, `12345678/../outra` mudaria o endereco chamado, e um
     * `?` ou `#` mudaria a consulta. Oito digitos ou nada.
     */
    const somenteDigitos = zipcode.replace(/\D/g, '');

    if (somenteDigitos.length !== 8) {
      throw new NotFoundException('Zipcode Not Found');
    }

    const { data } = await firstValueFrom(
      this.httpService.get<ZipcodeInfo>(
        `${this.zipcodeApi}/${somenteDigitos}/json/`,
      ),
    );

    if (!data || data.erro) {
      throw new NotFoundException('Zipcode Not Found');
    }

    return {
      ...data,
      cep: data.cep.replace(/-/g, ''),
    };
  }
}
