import { ApiException } from 'src/global/error/apiError';

export const validateCode = (equipmentCode: string): string => {
  const codeStartPattern = /^KR/gi;
  const ignoreEverythingAfterCodePrefix = equipmentCode.replace(
    /-[A-Z0-9]{3,}/gi,
    '',
  );
  const startsWithKR = codeStartPattern.test(equipmentCode);

  if (ignoreEverythingAfterCodePrefix.length < 3) {
    throw new ApiException('equipment_code_too_short');
  }

  if (!startsWithKR) {
    throw new ApiException('equipment_code_prefix');
  }

  return ignoreEverythingAfterCodePrefix.toUpperCase();
};
