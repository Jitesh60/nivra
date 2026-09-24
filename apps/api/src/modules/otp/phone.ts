import { parsePhoneNumberWithError } from 'libphonenumber-js/max';

/**
 * Normalises an Indian mobile number to E.164 (+91XXXXXXXXXX).
 * Accepts "98765 43210", "+91 98765-43210", "09876543210", etc.
 * Returns null for anything that isn't a valid Indian mobile number.
 */
export function normalizeIndianMobile(input: string): string | null {
  try {
    const phone = parsePhoneNumberWithError(input, 'IN');
    if (phone.country !== 'IN' || !phone.isValid()) return null;
    const type = phone.getType();
    if (type !== 'MOBILE' && type !== 'FIXED_LINE_OR_MOBILE') return null;
    return phone.number;
  } catch {
    return null;
  }
}
