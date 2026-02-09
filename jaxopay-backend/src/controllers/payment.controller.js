import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

// Get payment corridors
export const getPaymentCorridors = catchAsync(async (req, res) => {
  // In production, this would be fetched from database or payment provider API
  const corridors = [
    {
      from: 'USD',
      to: 'NGN',
      rate: 1550,
      fee_percentage: 1.5,
      min_amount: 10,
      max_amount: 10000,
      delivery_time: '5-30 minutes',
    },
    {
      from: 'USD',
      to: 'GHS',
      rate: 12.5,
      fee_percentage: 1.5,
      min_amount: 10,
      max_amount: 10000,
      delivery_time: '5-30 minutes',
    },
    {
      from: 'USD',
      to: 'KES',
      rate: 150,
      fee_percentage: 1.5,
      min_amount: 10,
      max_amount: 10000,
      delivery_time: '5-30 minutes',
    },
    {
      from: 'EUR',
      to: 'NGN',
      rate: 1700,
      fee_percentage: 1.5,
      min_amount: 10,
      max_amount: 10000,
      delivery_time: '5-30 minutes',
    },
  ];

  res.status(200).json({
    success: true,
    data: corridors,
  });
});

// Get beneficiaries
export const getBeneficiaries = catchAsync(async (req, res) => {
  const result = await query(
    `SELECT id, beneficiary_name, account_number, bank_name, bank_code,
            country, currency, beneficiary_type, created_at
     FROM beneficiaries
     WHERE user_id = $1 AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [req.user.id]
  );

  res.status(200).json({
    success: true,
    data: result.rows,
  });
});

// Add beneficiary
export const addBeneficiary = catchAsync(async (req, res) => {
  const {
    beneficiary_name,
    account_number,
    bank_name,
    bank_code,
    country,
    currency,
    beneficiary_type,
    metadata,
  } = req.body;

  const result = await query(
    `INSERT INTO beneficiaries
     (user_id, beneficiary_name, account_number, bank_name, bank_code,
      country, currency, beneficiary_type, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, beneficiary_name, account_number, bank_name, country, currency, created_at`,
    [
      req.user.id,
      beneficiary_name,
      account_number,
      bank_name,
      bank_code || null,
      country,
      currency.toUpperCase(),
      beneficiary_type || 'individual',
      metadata ? JSON.stringify(metadata) : null,
    ]
  );

  logger.info('Beneficiary added:', {
    userId: req.user.id,
    beneficiaryId: result.rows[0].id,
  });

  res.status(201).json({
    success: true,
    message: 'Beneficiary added successfully',
    data: result.rows[0],
  });
});

// Delete beneficiary
export const deleteBeneficiary = catchAsync(async (req, res) => {
  const { beneficiaryId } = req.params;

  const result = await query(
    `UPDATE beneficiaries
     SET deleted_at = NOW()
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [beneficiaryId, req.user.id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Beneficiary not found', 404);
  }

  logger.info('Beneficiary deleted:', {
    userId: req.user.id,
    beneficiaryId,
  });

  res.status(200).json({
    success: true,
    message: 'Beneficiary deleted successfully',
  });
});

import orchestrationLayer from '../orchestration/index.js';
import complianceEngine from '../orchestration/compliance/ComplianceEngine.js';
import routingEngine from '../orchestration/routing/RoutingEngine.js';

// Send money
export const sendMoney = catchAsync(async (req, res) => {
  const {
    beneficiary_id,
    source_currency,
    destination_currency,
    source_amount,
    purpose,
    priority = 'balanced'
  } = req.body;

  // 1. Central Compliance Check (KYC limits, AML, balance)
  await complianceEngine.validateTransaction(req.user.id, source_amount, 'CROSS_BORDER_PAYMENT');

  // 2. Select optimized Provider via Routing Engine
  const provider = await routingEngine.selectProvider({
    serviceType: 'payment',
    country: 'NG', // In production, resolve from beneficiary info
    amount: source_amount,
    currency: destination_currency,
    priority
  });

  // 3. Resolve wallets
  const sourceWallet = await query(
    'SELECT id FROM wallets WHERE user_id = $1 AND currency = $2',
    [req.user.id, source_currency.toUpperCase()]
  );

  if (sourceWallet.rows.length === 0) {
    throw new AppError(`No ${source_currency} wallet found`, 404);
  }

  // 4. Resolve Beneficiary details
  const beneficiary = await query(
    'SELECT * FROM beneficiaries WHERE id = $1 AND user_id = $2',
    [beneficiary_id, req.user.id]
  );

  if (beneficiary.rows.length === 0) {
    throw new AppError('Beneficiary not found', 404);
  }

  // 5. Execute via Orchestration Layer (Handles Failover + Ledger)
  const result = await orchestrationLayer.executePayment({
    providerId: provider.name.toLowerCase(),
    userId: req.user.id,
    fromWalletId: sourceWallet.rows[0].id,
    toWalletId: '00000000-0000-0000-0000-000000000000', // Platform Suspense Account
    amount: source_amount,
    currency: source_currency,
    destination_currency,
    beneficiary: beneficiary.rows[0],
    description: purpose || 'Cross-border transfer'
  });

  logger.info('Payment processed via Orchestration:', {
    userId: req.user.id,
    transactionId: result.transactionId,
    provider: provider.name
  });

  res.status(201).json({
    success: true,
    message: 'Payment sent successfully',
    data: {
      transaction_id: result.transactionId,
      status: result.status,
      provider: provider.name
    },
  });
});

// Get payment history
export const getPaymentHistory = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const offset = (page - 1) * limit;

  let conditions = 'WHERE user_id = $1';
  const params = [req.user.id];

  if (status) {
    params.push(status);
    conditions += ` AND status = $${params.length}`;
  }

  const result = await query(
    `SELECT p.id, p.beneficiary_id, p.source_currency, p.destination_currency,
            p.source_amount, p.destination_amount, p.exchange_rate, p.fee,
            p.status, p.purpose, p.created_at,
            b.beneficiary_name, b.account_number, b.bank_name
     FROM payments p
     LEFT JOIN beneficiaries b ON p.beneficiary_id = b.id
     ${conditions}
     ORDER BY p.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) as total FROM payments ${conditions}`,
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

// Get single payment
export const getPayment = catchAsync(async (req, res) => {
  const { paymentId } = req.params;

  const result = await query(
    `SELECT p.id, p.beneficiary_id, p.source_currency, p.destination_currency,
            p.source_amount, p.destination_amount, p.exchange_rate, p.fee,
            p.status, p.purpose, p.metadata, p.created_at, p.updated_at,
            b.beneficiary_name, b.account_number, b.bank_name, b.country
     FROM payments p
     LEFT JOIN beneficiaries b ON p.beneficiary_id = b.id
     WHERE p.id = $1 AND p.user_id = $2`,
    [paymentId, req.user.id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Payment not found', 404);
  }

  res.status(200).json({
    success: true,
    data: result.rows[0],
  });
});

// Get FX quote
export const getFXQuote = catchAsync(async (req, res) => {
  const { from, to, amount } = req.query;

  if (!from || !to || !amount) {
    throw new AppError('From, to, and amount are required', 400);
  }

  const exchangeRate = await getExchangeRate(from, to);
  const sourceAmount = parseFloat(amount);
  const fee = sourceAmount * 0.015; // 1.5% fee
  const destinationAmount = sourceAmount * exchangeRate;

  res.status(200).json({
    success: true,
    data: {
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      source_amount: sourceAmount,
      destination_amount: destinationAmount,
      exchange_rate: exchangeRate,
      fee,
      total_debit: sourceAmount + fee,
      timestamp: new Date().toISOString(),
      valid_for_seconds: 300, // Quote valid for 5 minutes
    },
  });
});

// Mock exchange rate function
async function getExchangeRate(from, to) {
  const rates = {
    USD_NGN: 1550,
    USD_GHS: 12.5,
    USD_KES: 150,
    EUR_NGN: 1700,
    EUR_GHS: 13.5,
    GBP_NGN: 2000,
  };

  const key = `${from.toUpperCase()}_${to.toUpperCase()}`;
  return rates[key] || 1;
}

