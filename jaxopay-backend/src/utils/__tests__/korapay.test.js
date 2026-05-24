import {
  getKorapayCountryCode,
  getKorapayHeaders,
  getKorapayTransferFailureMessage,
  isKorapayAuthError,
  isKorapayIpWhitelistError,
} from '../korapay.js';

describe('Korapay utilities', () => {
  const originalSecret = process.env.KORAPAY_SECRET_KEY;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.KORAPAY_SECRET_KEY;
    } else {
      process.env.KORAPAY_SECRET_KEY = originalSecret;
    }
  });

  test('trims the secret key when building authorization headers', () => {
    process.env.KORAPAY_SECRET_KEY = '  sk_live_testvalue  ';

    expect(getKorapayHeaders()).toEqual({
      Authorization: 'Bearer sk_live_testvalue',
      'Content-Type': 'application/json',
    });
  });

  test('classifies provider authorization errors', () => {
    const error = {
      response: {
        status: 401,
        data: { message: 'You are not authorized to access this resource' },
      },
    };

    expect(isKorapayAuthError(error)).toBe(true);
    expect(getKorapayTransferFailureMessage(error, 'NGN')).toBe(
      'Bank transfers are temporarily unavailable because Korapay did not authorize this payout request. Your funds have been returned.'
    );
  });

  test('classifies payout IP whitelist errors', () => {
    const error = {
      response: {
        status: 403,
        data: { message: 'Server IP address is not whitelisted' },
      },
    };

    expect(isKorapayIpWhitelistError(error)).toBe(true);
    expect(getKorapayTransferFailureMessage(error, 'NGN')).toBe(
      'Bank transfers are temporarily unavailable while the payout server IP is being configured. Your funds have been returned.'
    );
  });

  test('maps supported currencies to Korapay country codes', () => {
    expect(getKorapayCountryCode('NGN')).toBe('NG');
    expect(getKorapayCountryCode('kes')).toBe('KE');
    expect(getKorapayCountryCode('USD')).toBe('NG');
  });
});
