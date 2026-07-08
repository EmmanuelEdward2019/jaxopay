/**
 * Unit Tests for Webhook Verifier
 * Tests signature verification for all payment providers
 */

import crypto from 'crypto';
import verifier from '../webhookVerifier.js';

describe('WebhookVerifier', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    verifier.recentWebhooks.clear();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  afterAll(() => {
    if (verifier.cleanupInterval) {
      clearInterval(verifier.cleanupInterval);
    }
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
        'x-quidax-signature': `t=${timestamp},s=${signature}`
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
        'x-quidax-signature': `t=${oldTimestamp},s=${signature}`
      }, payload);

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
      process.env.FINCRA_SECRET_KEY = 'secret';
      
      const result = verifier.verify('fincra', {
        'x-fincra-signature': 'sig'
      }, '');

      expect(result).toBe(false);
    });

    test('should handle object payload', () => {
      const secret = 'test_secret_key';
      const payload = { event: 'test' };
      const payloadStr = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');

      process.env.FINCRA_SECRET_KEY = secret;

      const result = verifier.verify('fincra', {
        'x-fincra-signature': signature
      }, payload);

      expect(result).toBe(true);
    });

    test('should handle unknown provider', () => {
      const result = verifier.verify('unknown_provider', {}, 'payload');
      
      expect(result).toBe(false);
    });
  });
});
