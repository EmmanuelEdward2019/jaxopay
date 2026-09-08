import { buildDepositMetadata, depositNotificationDetails } from '../depositDetails.service.js';

/**
 * Fiat deposits stored `metadata: null` — the INSERTs omitted the column — so a deposit receipt
 * could only ever show amount, date and our own reference. These pin the normalisation that fixes
 * it, including the one field name that is genuinely counter-intuitive: Glyde returns the NIBSS
 * session ID as `merchant_reference` (confirmed against a real /virtual-accounts/{id}/transactions
 * response), NOT as anything called "session".
 */
describe('deposit metadata capture', () => {
  test('reads a Glyde credit: session ID from merchant_reference, plus the payer', () => {
    const glydeTx = {
      type: 'credit',
      status: 'successful',
      amount: 1000,
      fee: 10,
      reference: '2795c925-b288-49a2-93b8-c061a8540420',
      merchant_reference: '090405260906214417474390613226',
      payer_name: 'ADEBAYO JOHN',
      payer_bank: 'Guaranty Trust Bank',
      payer_account_number: '0123456789',
      narration: 'Wallet funding',
    };
    const meta = buildDepositMetadata(glydeTx, { provider: 'glyde', reference: 'dep-1' });

    expect(meta.session_id).toBe('090405260906214417474390613226');
    expect(meta.sender_name).toBe('ADEBAYO JOHN');
    expect(meta.sender_bank).toBe('Guaranty Trust Bank');
    expect(meta.sender_account).toBe('0123456789');
    expect(meta.narration).toBe('Wallet funding');
    expect(meta.provider).toBe('glyde');
    // The whole payload is kept so an unmapped field is still recoverable for support.
    expect(meta.provider_payload).toEqual(glydeTx);
  });

  test('a merchant_reference that is not NIBSS-shaped is never labelled a session ID', () => {
    // Some providers really do put their own UUID there. Showing it as "Session ID" would send a
    // customer to their bank quoting a number the bank has never seen.
    const meta = buildDepositMetadata(
      { merchant_reference: 'f542b14c-7ab6-4ea1-8105-cb722a1f665f', amount: 300 },
      { provider: 'glyde' }
    );
    expect(meta.session_id).toBeUndefined();
    expect(meta.provider_external_reference).toBe('f542b14c-7ab6-4ea1-8105-cb722a1f665f');
  });

  test('finds the payer however the provider nests it', () => {
    // Korapay-style: the payer sits under a nested object, with camelCase keys.
    const korapay = {
      amount: 5000,
      currency: 'NGN',
      payer: { name: 'JANE DOE', bankName: 'Access Bank', accountNumber: '9988776655' },
      payment_method: 'bank_transfer',
    };
    const meta = buildDepositMetadata(korapay, { provider: 'korapay' });
    expect(meta.sender_name).toBe('JANE DOE');
    expect(meta.sender_bank).toBe('Access Bank');
    expect(meta.sender_account).toBe('9988776655');
    expect(meta.payment_method).toBe('bank_transfer');
  });

  test('omits keys the provider did not send, rather than storing nulls', () => {
    // A receipt renders a row per present key, so a null would show as an empty labelled row.
    const meta = buildDepositMetadata({ amount: 100 }, { provider: 'glyde' });
    expect(meta).not.toHaveProperty('sender_name');
    expect(meta).not.toHaveProperty('session_id');
    expect(Object.values(meta).every((v) => v != null)).toBe(true);
  });

  test('survives a null or malformed payload', () => {
    expect(() => buildDepositMetadata(null, { provider: 'glyde' })).not.toThrow();
    expect(() => buildDepositMetadata('nonsense', { provider: 'glyde' })).not.toThrow();
    expect(buildDepositMetadata(null, { provider: 'glyde' }).provider).toBe('glyde');
  });

  test('notification details expose only customer-facing fields', () => {
    const meta = buildDepositMetadata(
      { payer_name: 'ADEBAYO JOHN', merchant_reference: '090405260906214417474390613226', secretish: 'x' },
      { provider: 'glyde' }
    );
    const notif = depositNotificationDetails(meta);
    expect(notif.senderName).toBe('ADEBAYO JOHN');
    expect(notif.sessionId).toBe('090405260906214417474390613226');
    // The raw payload must never ride along into an email or a push notification.
    expect(notif).not.toHaveProperty('provider_payload');
  });
});
