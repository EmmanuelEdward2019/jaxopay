/**
 * Works out a user's country from their phone number at signup.
 *
 * The mobile app used to send a hardcoded `country_code: 'US'` for every account (there is no
 * country picker on the signup screen) and the web app sends none at all, so this column was
 * either wrong or null for everyone. It is not decorative: it seeds `user_profiles.country`, which
 * is sent to the card issuer when a virtual card is created, and ComplianceEngine reads it when
 * deciding whether an operation is allowed in the user's country.
 *
 * Only unambiguous dialling codes are mapped. `+1` covers both the US and Canada and cannot be
 * resolved without parsing area codes, so it returns null and lets the caller fall back rather
 * than guessing.
 */

// The countries the platform actually operates in (GET /config/platform), minus +1.
const DIAL_CODES = [
  ['234', 'NG'],
  ['233', 'GH'],
  ['254', 'KE'],
  ['27', 'ZA'],
  ['44', 'GB'],
  ['86', 'CN'],
];

export function deriveCountryFromPhone(phone) {
  if (!phone || typeof phone !== 'string') return null;

  const digits = phone.replace(/[^\d]/g, '');
  if (!digits) return null;

  // A local Nigerian number, matched on the actual NG mobile prefixes rather than "11 digits
  // starting with 0". That looser rule collides with UK mobiles, which share the shape: a real
  // account with the number 07777436026 and a GB profile was being read as Nigerian. Nigeria uses
  // 070/071/080/081/090/091; the UK's 074-079 no longer match.
  if (/^0(70|71|80|81|90|91)\d{8}$/.test(digits)) return 'NG';

  for (const [code, iso2] of DIAL_CODES) {
    if (digits.startsWith(code)) return iso2;
  }

  return null;
}

/**
 * Country to store for a new signup.
 *
 * The phone number wins over whatever the client sent, because a client-supplied value has proven
 * to be a hardcoded constant rather than anything the user chose. A value the client sent is used
 * only when the number is unresolvable (e.g. a +1 number, where 'US' or 'CA' from the client is
 * better than a guess). Falling back to NG matches the default already used for
 * `user_profiles.country` further down the signup path.
 */
export function resolveSignupCountry(phone, providedCountryCode) {
  const fromPhone = deriveCountryFromPhone(phone);
  if (fromPhone) return fromPhone;

  const provided = typeof providedCountryCode === 'string' ? providedCountryCode.trim().toUpperCase() : '';
  if (/^[A-Z]{2}$/.test(provided)) return provided;

  return 'NG';
}

export default { deriveCountryFromPhone, resolveSignupCountry };
