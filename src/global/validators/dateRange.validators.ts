import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/*
 * Limites das datas de contrato e da calculadora. A conta da cobranca percorre
 * os dias do periodo: uma data como 9999-12-31 fazia cada equipamento custar
 * milhoes de passos, e a API inteira parava enquanto calculava.
 */

/** Maior periodo contratado: cinco anos. */
export const MAX_CONTRACT_DAYS = 1830;

/** Maior devolucao simulada, contada do inicio: dez anos. */
export const MAX_SIMULATION_DAYS = 3660;

/** Datas aceitas: de 2000 ao fim de 2099. Fora disso e digito errado, ou ataque. */
export const MIN_DATE = new Date('2000-01-01T00:00:00.000Z');
export const MAX_DATE = new Date('2100-01-01T00:00:00.000Z');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const time = (value: unknown): number =>
  value instanceof Date || typeof value === 'string'
    ? new Date(value).getTime()
    : Number.NaN;

/** A data cai entre `MIN_DATE` e `MAX_DATE`. Formato invalido fica com o `@IsDateString`. */
export function IsDateInRange(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isDateInRange',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          const at = time(value);

          if (Number.isNaN(at)) return true;

          return at >= MIN_DATE.getTime() && at < MAX_DATE.getTime();
        },
      },
    });
  };
}

/** A data fica no maximo `maxDays` dias depois da outra propriedade. */
export function IsWithinDays(
  property: string,
  maxDays: number,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isWithinDays',
      target: object.constructor,
      propertyName,
      constraints: [property, maxDays],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [related, days] = args.constraints as [string, number];
          const from = time((args.object as Record<string, unknown>)[related]);
          const to = time(value);

          if (Number.isNaN(from) || Number.isNaN(to)) return true;

          return to - from <= days * MS_PER_DAY;
        },
      },
    });
  };
}
