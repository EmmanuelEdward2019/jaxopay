import { buildQuidaxWithdrawalBody, getQuidaxErrorMessage, mapQuidaxWalletToCurrency } from '../quidax.js';

describe('Quidax utilities', () => {
  test('builds withdrawal payload with required reference', () => {
    expect(buildQuidaxWithdrawalBody({
      currency: 'USDT',
      amount: 10,
      fund_uid: 'TWMjBKD61DLXXQr6AvVnDMcVs5p46QSFzT',
      fund_uid2: 'memo-123',
      network: 'TRC20',
      reference: 'QWD-user-123',
      transaction_note: 'Jaxopay withdrawal QWD-user-123',
      narration: 'Withdrawal to wallet',
    })).toEqual({
      currency: 'usdt',
      amount: '10',
      fund_uid: 'TWMjBKD61DLXXQr6AvVnDMcVs5p46QSFzT',
      fund_uid2: 'memo-123',
      network: 'trc20',
      reference: 'QWD-user-123',
      transaction_note: 'Jaxopay withdrawal QWD-user-123',
      narration: 'Withdrawal to wallet',
    });
  });

  test('rejects withdrawal payloads without reference', () => {
    expect(() => buildQuidaxWithdrawalBody({
      currency: 'BTC',
      amount: '0.001',
      fund_uid: 'bc1qexample',
    })).toThrow('Quidax withdrawal reference is required');
  });

  test('extracts provider validation messages', () => {
    expect(getQuidaxErrorMessage({
      response: {
        data: { message: 'Validation failed: reference: Reference is required' },
      },
    })).toBe('Validation failed: reference: Reference is required');
  });

  test('maps wallet records to supported currency records', () => {
    expect(mapQuidaxWalletToCurrency({
      name: 'USDT',
      currency: 'usdt',
      is_crypto: true,
      networks: [{ network: 'trc20' }],
    })).toEqual({
      code: 'USDT',
      name: 'USDT',
      type: 'coin',
      min_deposit_amount: '0',
      precision: 8,
      networks: [{ network: 'trc20' }],
      withdraw_fee: '0',
    });
  });
});
