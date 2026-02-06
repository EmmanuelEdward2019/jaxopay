import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

// Get bill providers
export const getBillProviders = catchAsync(async (req, res) => {
  const { category, country } = req.query;

  // In production, this would be fetched from database or provider API
  let providers = [
    {
      id: 'ikeja-electric',
      name: 'Ikeja Electric',
      category: 'electricity',
      country: 'Nigeria',
      logo: 'https://example.com/ikeja.png',
      fields: ['meter_number'],
    },
    {
      id: 'eko-electric',
      name: 'Eko Electricity Distribution',
      category: 'electricity',
      country: 'Nigeria',
      logo: 'https://example.com/eko.png',
      fields: ['meter_number'],
    },
    {
      id: 'dstv',
      name: 'DSTV',
      category: 'cable_tv',
      country: 'Nigeria',
      logo: 'https://example.com/dstv.png',
      fields: ['smartcard_number'],
    },
    {
      id: 'gotv',
      name: 'GOtv',
      category: 'cable_tv',
      country: 'Nigeria',
      logo: 'https://example.com/gotv.png',
      fields: ['iuc_number'],
    },
    {
      id: 'mtn',
      name: 'MTN',
      category: 'airtime',
      country: 'Nigeria',
      logo: 'https://example.com/mtn.png',
      fields: ['phone_number'],
    },
    {
      id: 'airtel',
      name: 'Airtel',
      category: 'airtime',
      country: 'Nigeria',
      logo: 'https://example.com/airtel.png',
      fields: ['phone_number'],
    },
    {
      id: 'glo',
      name: 'Glo',
      category: 'airtime',
      country: 'Nigeria',
      logo: 'https://example.com/glo.png',
      fields: ['phone_number'],
    },
    {
      id: 'spectranet',
      name: 'Spectranet',
      category: 'internet',
      country: 'Nigeria',
      logo: 'https://example.com/spectranet.png',
      fields: ['account_number'],
    },
  ];

  // Filter by category
  if (category) {
    providers = providers.filter((p) => p.category === category);
  }

  // Filter by country
  if (country) {
    providers = providers.filter((p) => p.country === country);
  }

  res.status(200).json({
    success: true,
    data: providers,
  });
});

// Validate bill account
export const validateBillAccount = catchAsync(async (req, res) => {
  const { provider_id, account_number } = req.body;

  // In production, this would call the provider's API to validate
  // Mock validation
  const isValid = account_number && account_number.length >= 8;

  if (!isValid) {
    throw new AppError('Invalid account number', 400);
  }

  // Mock customer details
  const customerDetails = {
    account_number,
    customer_name: 'John Doe',
    address: '123 Main Street, Lagos',
    account_type: 'Prepaid',
    outstanding_balance: 0,
  };

  res.status(200).json({
    success: true,
    message: 'Account validated successfully',
    data: customerDetails,
  });
});

// Pay bill
export const payBill = catchAsync(async (req, res) => {
  const { provider_id, account_number, amount, currency, metadata } = req.body;

  // Check KYC tier
  if (req.user.kyc_tier < 1) {
    throw new AppError('KYC Tier 1 or higher required to pay bills', 403);
  }

  if (amount <= 0) {
    throw new AppError('Amount must be greater than 0', 400);
  }

  const result = await transaction(async (client) => {
    // Get user wallet with lock
    const wallet = await client.query(
      `SELECT id, balance FROM wallets
       WHERE user_id = $1 AND currency = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [req.user.id, currency.toUpperCase()]
    );

    if (wallet.rows.length === 0) {
      throw new AppError(`No ${currency} wallet found`, 404);
    }

    const fee = amount * 0.005; // 0.5% fee
    const totalDebit = amount + fee;

    if (parseFloat(wallet.rows[0].balance) < totalDebit) {
      throw new AppError('Insufficient balance', 400);
    }

    // Deduct from wallet
    await client.query(
      'UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2',
      [totalDebit, wallet.rows[0].id]
    );

    // Create bill payment record
    const billPayment = await client.query(
      `INSERT INTO bill_payments
       (user_id, provider_id, account_number, amount, currency, fee, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, 'processing', $7)
       RETURNING id, status, created_at`,
      [
        req.user.id,
        provider_id,
        account_number,
        amount,
        currency.toUpperCase(),
        fee,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );

    // Create wallet transaction
    await client.query(
      `INSERT INTO wallet_transactions
       (wallet_id, transaction_type, amount, currency, status, description, metadata)
       VALUES ($1, 'bill_payment', $2, $3, 'completed', 'Bill payment', $4)`,
      [
        wallet.rows[0].id,
        totalDebit,
        currency.toUpperCase(),
        JSON.stringify({
          bill_payment_id: billPayment.rows[0].id,
          provider_id,
          account_number,
          fee,
        }),
      ]
    );

    return {
      billPaymentId: billPayment.rows[0].id,
      fee,
    };
  });

  logger.info('Bill payment processed:', {
    userId: req.user.id,
    billPaymentId: result.billPaymentId,
    amount,
  });

  res.status(201).json({
    success: true,
    message: 'Bill payment initiated successfully',
    data: {
      bill_payment_id: result.billPaymentId,
      amount,
      currency: currency.toUpperCase(),
      fee: result.fee,
      total_debit: amount + result.fee,
      status: 'processing',
    },
  });
});

// Get bill payment history
export const getBillHistory = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, provider_id, status } = req.query;
  const offset = (page - 1) * limit;

  let conditions = 'WHERE user_id = $1';
  const params = [req.user.id];

  if (provider_id) {
    params.push(provider_id);
    conditions += ` AND provider_id = $${params.length}`;
  }

  if (status) {
    params.push(status);
    conditions += ` AND status = $${params.length}`;
  }

  const result = await query(
    `SELECT id, provider_id, account_number, amount, currency, fee,
            status, metadata, created_at, updated_at
     FROM bill_payments
     ${conditions}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) as total FROM bill_payments ${conditions}`,
    params
  );

  res.status(200).json({
    success: true,
    data: {
      payments: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit),
      },
    },
  });
});

// Get single bill payment
export const getBillPayment = catchAsync(async (req, res) => {
  const { billPaymentId } = req.params;

  const result = await query(
    `SELECT id, provider_id, account_number, amount, currency, fee,
            status, metadata, created_at, updated_at
     FROM bill_payments
     WHERE id = $1 AND user_id = $2`,
    [billPaymentId, req.user.id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Bill payment not found', 404);
  }

  res.status(200).json({
    success: true,
    data: result.rows[0],
  });
});

// Get bill categories
export const getBillCategories = catchAsync(async (req, res) => {
  const categories = [
    {
      id: 'electricity',
      name: 'Electricity',
      icon: '⚡',
      description: 'Pay your electricity bills',
    },
    {
      id: 'cable_tv',
      name: 'Cable TV',
      icon: '📺',
      description: 'Subscribe to cable TV services',
    },
    {
      id: 'airtime',
      name: 'Airtime',
      icon: '📱',
      description: 'Buy mobile airtime',
    },
    {
      id: 'internet',
      name: 'Internet',
      icon: '🌐',
      description: 'Pay for internet services',
    },
    {
      id: 'water',
      name: 'Water',
      icon: '💧',
      description: 'Pay water bills',
    },
  ];

  res.status(200).json({
    success: true,
    data: categories,
  });
});

