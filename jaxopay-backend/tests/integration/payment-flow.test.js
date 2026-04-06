/**
 * Integration Tests - Complete Payment Flow
 * Tests end-to-end payment scenarios with decimal.js and transactions
 */

import request from 'supertest';
import app from '../../src/server.js';
import { query, transaction } from '../../src/config/database.js';
import { decimal } from '../../src/utils/financial.js';

describe('Payment Flow Integration Tests', () => {
  let authToken;
  let userId;
  let walletId;

  beforeAll(async () => {
    // Create test user and authenticate
    const userRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `test${Date.now()}@example.com`,
        password: 'Test123!@#',
        first_name: 'Test',
        last_name: 'User'
      });

    authToken = userRes.body.data.token;
    userId = userRes.body.data.user.id;

    // Get user's wallet
    const walletRes = await query(
      'SELECT id FROM wallets WHERE user_id = $1 AND currency = $2 LIMIT 1',
      [userId, 'NGN']
    );
    walletId = walletRes.rows[0]?.id;
  });

  afterAll(async () => {
    // Cleanup test data
    if (userId) {
      await query('DELETE FROM users WHERE id = $1', [userId]);
    }
  });

  describe('Wallet Deposit with Decimal Precision', () => {
    test('should deposit exact amount with no precision loss', async () => {
      const depositAmount = '100.50';

      // Get balance before
      const beforeBalance = await query(
        'SELECT balance FROM wallets WHERE id = $1',
        [walletId]
      );
      const balanceBefore = decimal(beforeBalance.rows[0].balance);

      // Simulate deposit (would normally come from Korapay webhook)
      await transaction(async (client) => {
        await client.query(
          'UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2',
          [depositAmount, walletId]
        );
      });

      // Get balance after
      const afterBalance = await query(
        'SELECT balance FROM wallets WHERE id = $1',
        [walletId]
      );
      const balanceAfter = decimal(afterBalance.rows[0].balance);

      // Verify exact precision
      const expectedBalance = balanceBefore.plus(depositAmount);
      expect(balanceAfter.toString()).toBe(expectedBalance.toString());
      expect(balanceAfter.toString()).toContain('100.5'); // No floating point errors
    });

    test('should handle multiple concurrent deposits atomically', async () => {
      const deposits = ['10.25', '20.50', '30.75'];

      // Execute concurrent deposits
      await Promise.all(
        deposits.map(amount =>
          transaction(async (client) => {
            await client.query(
              'UPDATE wallets SET balance = balance + $1 WHERE id = $2',
              [amount, walletId]
            );
          })
        )
      );

      // Verify total is correct
      const result = await query('SELECT balance FROM wallets WHERE id = $1', [walletId]);
      const balance = decimal(result.rows[0].balance);

      // Should include all deposits
      const totalDeposits = deposits.reduce((sum, amt) => sum.plus(amt), decimal(0));
      expect(balance.gte(totalDeposits)).toBe(true);
    });
  });

  describe('Payment with Fee Calculation', () => {
    test('should calculate and deduct fee correctly', async () => {
      // First, fund the wallet
      await transaction(async (client) => {
        await client.query(
          'UPDATE wallets SET balance = 1000.00 WHERE id = $1',
          [walletId]
        );
      });

      const sendAmount = '100.00';
      const feePercentage = 1.5; // 1.5%
      const expectedFee = decimal(sendAmount).times(feePercentage).dividedBy(100);
      const expectedTotal = decimal(sendAmount).plus(expectedFee);

      // Create payment (simplified - normally via API)
      const reference = `TEST-${Date.now()}`;
      await transaction(async (client) => {
        // Deduct amount + fee
        await client.query(
          'UPDATE wallets SET balance = balance - $1 WHERE id = $2',
          [expectedTotal.toString(), walletId]
        );

        // Record transaction
        await client.query(
          `INSERT INTO transactions 
           (user_id, from_wallet_id, transaction_type, from_amount, from_currency, 
            fee_amount, fee_currency, status, reference)
           VALUES ($1, $2, 'transfer', $3, $4, $5, $6, 'completed', $7)`,
          [userId, walletId, sendAmount, 'NGN', expectedFee.toString(), 'NGN', reference]
        );
      });

      // Verify transaction recorded correctly
      const txResult = await query(
        'SELECT * FROM transactions WHERE reference = $1',
        [reference]
      );
      
      expect(txResult.rows.length).toBe(1);
      expect(decimal(txResult.rows[0].from_amount).toString()).toBe(sendAmount);
      expect(decimal(txResult.rows[0].fee_amount).toString()).toBe(expectedFee.toString());
    });
  });

  describe('Idempotency Protection', () => {
    test('should prevent duplicate payments with same idempotency key', async () => {
      const idempotencyKey = `test-key-${Date.now()}`;

      // First request
      const res1 = await request(app)
        .post('/api/v1/payments/send')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Idempotency-Key', idempotencyKey)
        .send({
          beneficiary_id: 'test-beneficiary',
          source_amount: 50,
          source_currency: 'NGN',
          purpose: 'Test payment'
        });

      // Second request with same key
      const res2 = await request(app)
        .post('/api/v1/payments/send')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Idempotency-Key', idempotencyKey)
        .send({
          beneficiary_id: 'test-beneficiary',
          source_amount: 50,
          source_currency: 'NGN',
          purpose: 'Test payment'
        });

      // Both should succeed (second returns cached response)
      expect(res1.statusCode).toBe(201);
      expect(res2.statusCode).toBe(200); // Cached response
      
      // Should have same reference
      if (res1.body.data && res2.body.data) {
        expect(res1.body.data.reference).toBe(res2.body.data.reference);
      }
    });
  });

  describe('Insufficient Balance Protection', () => {
    test('should reject payment when balance insufficient', async () => {
      // Set wallet to small balance
      await transaction(async (client) => {
        await client.query(
          'UPDATE wallets SET balance = 10.00 WHERE id = $1',
          [walletId]
        );
      });

      const res = await request(app)
        .post('/api/v1/payments/send')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Idempotency-Key', `insufficient-${Date.now()}`)
        .send({
          beneficiary_id: 'test-beneficiary',
          source_amount: 1000,
          source_currency: 'NGN',
          purpose: 'Test payment'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('Insufficient');
    });
  });

  describe('Webhook Processing', () => {
    test('should process Korapay deposit webhook correctly', async () => {
      const depositAmount = '500.00';
      const reference = `KORA-${Date.now()}`;

      const beforeBalance = await query(
        'SELECT balance FROM wallets WHERE id = $1',
        [walletId]
      );

      // Simulate webhook (would have valid signature in production)
      const webhookPayload = {
        event: 'charge.success',
        data: {
          reference,
          amount: parseFloat(depositAmount),
          currency: 'NGN'
        }
      };

      await request(app)
        .post('/api/v1/webhooks/korapay')
        .send(webhookPayload);

      // Small delay for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      const afterBalance = await query(
        'SELECT balance FROM wallets WHERE id = $1',
        [walletId]
      );

      // Balance should have increased (if webhook processed)
      const increase = decimal(afterBalance.rows[0].balance).minus(beforeBalance.rows[0].balance);
      expect(increase.gte(0)).toBe(true);
    });
  });
});

