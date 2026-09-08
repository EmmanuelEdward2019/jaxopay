import { extractSessionId, isNibssSessionId } from '../payoutSession.service.js';

/**
 * The payloads below are Obiex's own documented examples, copied verbatim from
 * developer.obiex.finance (2026-09-08) — the request-time payout response from
 * /api-reference/payouts/request-bank-account-withdrawal, the settled payout row from
 * /api-reference/transactions/get-payout-transactions, and the WITHDRAWAL webhook body from
 * /api-reference/webhooks. They're what the whole "fetch the session ID from the API" design is
 * derived from, so they're worth pinning: if any of these shapes shifts, this fails loudly rather
 * than the session ID silently going missing from receipts again.
 */
describe('NIBSS session ID extraction', () => {
  test('recognises a NIBSS session ID by shape (30 digits)', () => {
    expect(isNibssSessionId('436246970508842220876716789858')).toBe(true);
    // A UUID reference is not one, and must never be shown as "Session ID" on a receipt.
    expect(isNibssSessionId('e7cf2c45-3354-4097-90c4-a0ca0d264b1b')).toBe(false);
    expect(isNibssSessionId('')).toBe(false);
    expect(isNibssSessionId(null)).toBe(false);
    expect(isNibssSessionId('43624697050884222087671678985')).toBe(false); // 29 digits
  });

  test('finds payout.externalReference on a settled payout row', () => {
    const settledPayoutRow = {
      id: 'dcd4f3f3-99f6-4883-b11d-d66e82b07697',
      reference: 'e7cf2c45-3354-4097-90c4-a0ca0d264b1b',
      type: 'DEBIT',
      category: 'WITHDRAWAL',
      amount: 1000,
      payout: {
        id: 'a96b5522-9bc6-4c06-bbcc-a7ab2153c401',
        transferReference: 'e7cf2c45-3354-4097-90c4-a0ca0d264b1b',
        externalReference: '436246970508842220876716789858',
        status: 'SUCCESSFUL',
        transactionId: 'dcd4f3f3-99f6-4883-b11d-d66e82b07697',
        bankAccount: { accountNumber: '20xxxxxxx', accountName: 'Jane Doe', bankName: 'UBA', bankCode: '033' },
      },
    };
    expect(extractSessionId(settledPayoutRow)).toBe('436246970508842220876716789858');
  });

  test('prefers the NIBSS-shaped value over a UUID sitting in an earlier field', () => {
    // transferReference is a UUID and comes first in the payout object; picking the first
    // non-empty string would put a meaningless UUID on the receipt labelled "Session ID".
    const row = {
      payout: {
        transferReference: 'e7cf2c45-3354-4097-90c4-a0ca0d264b1b',
        externalReference: '436246970508842220876716789858',
      },
    };
    expect(extractSessionId(row)).toBe('436246970508842220876716789858');
  });

  test('returns null at payout request time, when Obiex has not issued one yet', () => {
    // Straight from the Request Bank Account Withdrawal docs: externalReference is null and the
    // payout is only "APPROVED". This is why the session ID can never be captured on the way out
    // and has to be fetched afterwards.
    const requestTimeResponse = {
      id: '0edb705b-9392-49c7-ad16-76bea0f84faf',
      reference: 'bb976d10-d805-456a-9b3e-5a4ec4c9a026',
      category: 'WITHDRAWAL',
      amount: 15000,
      payout: {
        id: '4c55a831-7909-432a-8db4-5514ff9fac62',
        transferReference: null,
        externalReference: null,
        status: 'APPROVED',
        fee: 50,
        payoutAmount: 15000,
        payoutCurrency: 'NGNX',
      },
    };
    expect(extractSessionId(requestTimeResponse)).toBeNull();
  });

  test('returns null for the WITHDRAWAL webhook body, which carries no session ID at all', () => {
    const webhookBody = {
      type: 'WITHDRAWAL',
      currency: 'USDT',
      amount: 10,
      status: 'SUCCESSFUL',
      reference: '6698fa68-9d39-40c5-87aa-c72b706437ae',
      transactionId: 'b1ce4f58-3141-4449-938f-8329511497ec',
      createdAt: '2026-03-26T09:29:39.420Z',
      lastUpdated: '2026-03-26T09:29:39.420Z',
      hash: 'adfb8a07-7193-4b19-8bcd-88e60d1c03d1',
      network: 'BSC',
      address: '0x1FFE2134c82D07227715af2A12D1406165A305BF',
    };
    expect(extractSessionId(webhookBody)).toBeNull();
  });

  test('still honours an explicit sessionId field, wherever it is nested', () => {
    // Not a shape Obiex publishes today, but it costs nothing and is the field name any provider
    // would naturally use if one appeared.
    expect(extractSessionId({ raw: { data: { sessionId: '090110250908120000123456789012' } } }))
      .toBe('090110250908120000123456789012');
  });

  test('falls back to a non-NIBSS external reference rather than dropping it', () => {
    // The caller stores this as provider_external_reference, not as "Session ID" — see
    // ensureSessionId / the Obiex webhook handler.
    expect(extractSessionId({ payout: { externalReference: 'PAGA-99213' } })).toBe('PAGA-99213');
  });

  test('handles empty and malformed payloads without throwing', () => {
    expect(extractSessionId(null)).toBeNull();
    expect(extractSessionId(undefined)).toBeNull();
    expect(extractSessionId({})).toBeNull();
    expect(extractSessionId({ payout: null })).toBeNull();
    expect(extractSessionId({ payout: { externalReference: '   ' } })).toBeNull();
  });
});
