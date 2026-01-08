/**
 * Normalize phone number to exactly 9 digits
 * Rules:
 * 1. Remove spaces and non-digits
 * 2. If starts with +252 or 252, remove country code
 * 3. If starts with 0 and length=10, remove 0
 * 4. Final phone must be exactly 9 digits
 */
export function normalizePhone(phone: string): string | null {
  if (!phone || typeof phone !== 'string') {
    return null;
  }

  // Step 1: Remove all non-digits
  let numericPhone = phone.replace(/\D/g, '');

  if (numericPhone.length === 0) {
    return null;
  }

  // Step 2: Remove country code if starts with +252 or 252
  if (numericPhone.startsWith('252') && numericPhone.length >= 12) {
    // Remove country code (252) - take remaining digits
    numericPhone = numericPhone.substring(3);
  } else if (numericPhone.startsWith('+252')) {
    // This shouldn't happen after step 1, but handle it anyway
    numericPhone = numericPhone.replace(/^\+?252/, '');
  }

  // Step 3: If starts with 0 and length=10, remove leading 0
  if (numericPhone.startsWith('0') && numericPhone.length === 10) {
    numericPhone = numericPhone.substring(1);
  }

  // Step 4: Final phone must be exactly 9 digits
  if (numericPhone.length !== 9) {
    return null;
  }

  // Verify it's all digits
  if (!/^\d{9}$/.test(numericPhone)) {
    return null;
  }

  return numericPhone;
}

