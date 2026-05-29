import { jest } from '@jest/globals';
import { createQuidaxWebhookService } from '../quidaxWebhook.service.js';

describe('Quidax webhook service', () => {
  let mockClient;
  let transaction;
  let logger;
  let service;

  beforeEach(() => {
    mockClient = { query: jest.fn() };
    transaction = jest.fn(async (callback) => callback(mockClient));
    logger = {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    };
    service = createQuidaxWebhookService({ transaction, logger });
  });

  test('credits TRX deposit with no address by creating the crypto wallet from Quidax user refs', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ id: 'user-123' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'wallet-trx', user_id: 'user-123' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    await service.creditUserWalletByQuidax({
      id: 'trx-deposit-1',
      amount: '12.50000000',
      currency: 'TRX',
      user: { id: 'ejzs9qe5' },
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(mockClient.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('quidax_user_sn = ANY'),
      [['ejzs9qe5'], 'ejzs9qe5']
    );
    expect(mockClient.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO wallets'),
      ['user-123', 'TRX', null, null]
    );
    expect(mockClient.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('UPDATE wallets'),
      [12.5, 'wallet-trx']
    );
    expect(mockClient.query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('INSERT INTO wallet_transactions'),
      [
        'wallet-trx',
        12.5,
        'TRX',
        'Crypto deposit via Quidax (trx-deposit-1)',
        expect.stringContaining('"quidax_user_refs":["ejzs9qe5"]'),
      ]
    );
  });

  test('wallet.address.generated upserts the crypto wallet instead of only updating existing rows', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ id: 'user-123' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'wallet-trx', user_id: 'user-123' }] });

    await service.persistQuidaxWalletAddress({
      currency: 'TRX',
      address: 'THaZjLxjAbxhcForYJPE7LmdWHu1Cn8Pry',
      user: { id: 'ejzs9qe5' },
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(mockClient.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('ON CONFLICT (user_id, currency) DO UPDATE'),
      ['user-123', 'TRX', 'THaZjLxjAbxhcForYJPE7LmdWHu1Cn8Pry', null]
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('wallet.address.generated: TRX address THaZjLxjAbxhcForYJPE7LmdWHu1Cn8Pry saved for wallet wallet-trx')
    );
  });

  test('uses documented nested payment_address fields when crediting a deposit', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ id: 'user-123' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'wallet-trx', user_id: 'user-123' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    await service.creditUserWalletByQuidax({
      id: 'trx-deposit-2',
      amount: '3.0',
      currency: 'trx',
      payment_address: {
        address: 'TKipGdUmft8UsHQsmLi8eaAX63RxxQt3cN',
        destination_tag: 'memo-123',
        user: { id: 'u2d7imxe', sn: 'QDXTEJ7YRMF' },
      },
    });

    expect(mockClient.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('quidax_user_sn = ANY'),
      [['u2d7imxe', 'QDXTEJ7YRMF'], 'u2d7imxe']
    );
    expect(mockClient.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO wallets'),
      ['user-123', 'TRX', 'TKipGdUmft8UsHQsmLi8eaAX63RxxQt3cN', 'memo-123']
    );
    expect(mockClient.query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('INSERT INTO wallet_transactions'),
      [
        'wallet-trx',
        3,
        'TRX',
        'Crypto deposit via Quidax (trx-deposit-2)',
        expect.stringContaining('"address":"TKipGdUmft8UsHQsmLi8eaAX63RxxQt3cN"'),
      ]
    );
  });
});
