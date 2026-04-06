/**
 * Unit Tests for Webhook Verifier
 * Tests signature verification for all payment providers
 */

import crypto from 'crypto';
import WebhookVerifier from '../webhookVerifier.js';

describe('WebhookVerifier', () => {
  let verifier;
  const originalEnv = process.env;

  beforeEach(() => {
    verifier = new WebhookVerifier();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    if (verifier.cleanupInterval) {
      clearInterval(verifier.cleanupInterval);
    }
  });

  describe('Korapay Verification', () => {
    test('should verify valid Korapay signature', () => {
      const secret = 'test_secret_key';
      const payload = JSON.stringify({ event: 'charge.success', data: { amount: 100 } });
      const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      process.env.KORAPAY_SECRET_KEY = secret;

      const result = verifier.verify('korapay', {
        'x-korapay-signature': signature
      }, payload);

      expect(result).toBe(true);
    });

    test('should reject invalid Korapay signature', () => {
      process.env.KORAPAY_SECRET_KEY = 'test_secret_key';

      const result = verifier.verify('korapay', {
        'x-korapay-signature': 'invalid_signature'
      }, 'payload');

      expect(result).toBe(false);
    });

    test('should reject when signature missing', () => {
      process.env.KORAPAY_SECRET_KEY = 'test_secret_key';

      const result = verifier.verify('korapay', {}, 'payload');

      expect(result).toBe(false);
    });

    test('should allow in development when no secret configured', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.KORAPAY_SECRET_KEY;

      const result = verifier.verify('korapay', {
        'x-korapay-signature': 'any_signature'
      }, 'payload');

      expect(result).toBe(true);
    });

    test('should reject in production when no secret configured', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.KORAPAY_SECRET_KEY;

      const result = verifier.verify('korapay', {}, 'payload');

      expect(result).toBe(false);
    });
  });

  describe('Paystack Verification', () => {
    test('should verify valid Paystack signature', () => {
      const secret = 'test_secret_key';
      const payload = JSON.stringify({ event: 'charge.success' });
      const signature = crypto.createHmac('sha512', secret).update(payload).digest('hex');

      process.env.PAYSTACK_SECRET_KEY = secret;

      const result = verifier.verify('paystack', {
        'x-paystack-signature': signature
      }, payload);

      expect(result).toBe(true);
    });

    test('should reject invalid Paystack signature', () => {
      process.env.PAYSTACK_SECRET_KEY = 'test_secret_key';

      const result = verifier.verify('paystack', {
        'x-paystack-signature': 'invalid'
      }, 'payload');

      expect(result).toBe(false);
    });
  });

  describe('Quidax Verification', () => {
    test('should verify valid Quidax signature with timestamp', () => {
      const secret = 'test_secret_key';
      const timestamp = Math.floor(Date.now() / 1000);
      const payload = JSON.stringify({ event: 'deposit.successful' });
      const signaturePayload = `${timestamp}.${payload}`;
      const signature = crypto.createHmac('sha256', secret).update(signaturePayload).digest('hex');

      process.env.QUIDAX_WEBHOOK_SECRET = secret;

      const result = verifier.verify('quidax', {
        'x-quidax-signature': signature,
        'x-quidax-timestamp': timestamp.toString()
      }, payload);

      expect(result).toBe(true);
    });

    test('should reject old Quidax webhook (replay attack)', () => {
      const secret = 'test_secret_key';
      const oldTimestamp = Math.floor(Date.now() / 1000) - (10 * 60); // 10 minutes ago
      const payload = JSON.stringify({ event: 'deposit.successful' });
      const signaturePayload = `${oldTimestamp}.${payload}`;
      const signature = crypto.createHmac('sha256', secret).update(signaturePayload).digest('hex');

      process.env.QUIDAX_WEBHOOK_SECRET = secret;

      const result = verifier.verify('quidax', {
        'x-quidax-signature': signature,
        'x-quidax-timestamp': oldTimestamp.toString()
      }, payload);

      expect(result).toBe(false);
    });
  });

  describe('Graph Finance Verification', () => {
    test('should verify valid Graph Finance signature', () => {
      const secret = 'test_secret_key';
      const payload = JSON.stringify({ event: 'card.transaction' });
      const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      process.env.GRAPH_WEBHOOK_SECRET = secret;

      const result = verifier.verify('graph', {
        'x-graph-signature': signature
      }, payload);

      expect(result).toBe(true);
    });
  });

  describe('Flutterwave Verification', () => {
    test('should verify valid Flutterwave hash', () => {
      const hash = 'test_secret_hash';
      process.env.FLUTTERWAVE_SECRET_HASH = hash;

      const result = verifier.verify('flutterwave', {
        'verif-hash': hash
      }, 'payload');

      expect(result).toBe(true);
    });

    test('should reject invalid Flutterwave hash', () => {
      process.env.FLUTTERWAVE_SECRET_HASH = 'correct_hash';

      const result = verifier.verify('flutterwave', {
        'verif-hash': 'wrong_hash'
      }, 'payload');

      expect(result).toBe(false);
    });
  });

  describe('Replay Attack Prevention', () => {
    test('should prevent duplicate webhook processing', () => {
      const webhookId = 'unique-webhook-123';

      // First call should succeed
      const firstCheck = verifier._checkReplayAttack(webhookId, Math.floor(Date.now() / 1000));
      expect(firstCheck).toBe(true);

      // Second call with same ID should fail
      const secondCheck = verifier._checkReplayAttack(webhookId, Math.floor(Date.now() / 1000));
      expect(secondCheck).toBe(false);
    });

    test('should allow different webhook IDs', () => {
      const id1 = 'webhook-1';
      const id2 = 'webhook-2';

      const check1 = verifier._checkReplayAttack(id1, Math.floor(Date.now() / 1000));
      const check2 = verifier._checkReplayAttack(id2, Math.floor(Date.now() / 1000));

      expect(check1).toBe(true);
      expect(check2).toBe(true);
    });

    test('should reject webhooks with future timestamps', () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + (5 * 60); // 5 minutes in future
      
      const result = verifier._checkReplayAttack('webhook-future', futureTimestamp);
      
      expect(result).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty payload', () => {
      process.env.KORAPAY_SECRET_KEY = 'secret';
      
      const result = verifier.verify('korapay', {
        'x-korapay-signature': 'sig'
      }, '');

      expect(result).toBe(false);
    });

    test('should handle object payload', () => {
      const secret = 'test_secret_key';
      const payload = { event: 'test' };
      const payloadStr = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');

      process.env.KORAPAY_SECRET_KEY = secret;

      const result = verifier.verify('korapay', {
        'x-korapay-signature': signature
      }, payload);

      expect(result).toBe(true);
    });

    test('should handle unknown provider', () => {
      const result = verifier.verify('unknown_provider', {}, 'payload');
      
      expect(result).toBe(false);
    });
  });
});

