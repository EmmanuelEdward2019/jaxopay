import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import emailService from '../services/email.service.js';
import axios from 'axios';
import crypto from 'crypto';
import { decimal, validateAmount, formatForDB, hasSufficientBalance } from '../utils/financial.js';

const buildApiV1Url = (path) => {
  const rawBaseUrl = (process.env.API_BASE_URL || 'http://localhost:3001').trim();
  const baseUrl = /^https?:\/\//i.test(rawBaseUrl) ? rawBaseUrl : `https://${rawBaseUrl}`;
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/+$/, '').replace(/\/api\/v\d+$/i, '');

  url.pathname = `${basePath}/api/v1/${String(path).replace(/^\/+/, '')}`.replace(/\/{2,}/g, '/');
  url.search = '';
  url.hash = '';

  return url.toString();
};

const KORAPAY_CHECKOUT_CURRENCIES = new Set(
  (process.env.KORAPAY_CHECKOUT_CURRENCIES || 'NGN')
    .split(',')
    .map((currency) => currency.trim().toUpperCase())
    .filter(Boolean)
);

const formatProviderValidationErrors = (errors) => {
  if (!errors || typeof errors !== 'object') return '';

  return Object.entries(errors)
    .map(([field, detail]) => {
      const message = typeof detail === 'object' && detail !== null ? detail.message : detail;
      return message ? `${field}: ${message}` : field;
    })
    .join('; ');
};

// Get all user wallets
export const getWallets = catchAsync(async (req, res) => {
  const result = await query(
    `SELECT id, currency, wallet_type, balance, available_balance, locked_balance, is_active, created_at, updated_at
     FROM wallets
     WHERE user_id = $1
     ORDER BY created_at ASC`,
    [req.user.id]
  );

  res.status(200).json({
    success: true,
    data: result.rows,
  });
});

// Get single wallet by ID
export const getWallet = catchAsync(async (req, res) => {
  const { walletId } = req.params;

  const result = await query(
    `SELECT id, currency, wallet_type, balance, is_active, created_at, updated_at
     FROM wallets
     WHERE id = $1 AND user_id = $2`,
    [walletId, req.user.id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Wallet not found', 404);
  }

  res.status(200).json({
    success: true,
    data: result.rows[0],
  });
});

// Get wallet by currency
export const getWalletByCurrency = catchAsync(async (req, res) => {
  const { currency } = req.params;

  const result = await query(
    `SELECT id, currency, wallet_type, balance, is_active, created_at, updated_at
     FROM wallets
     WHERE user_id = $1 AND currency = $2`,
    [req.user.id, currency.toUpperCase()]
  );

  if (result.rows.length === 0) {
    throw new AppError('Wallet not found for this currency', 404);
  }

  res.status(200).json({
    success: true,
    data: result.rows[0],
  });
});

// Create new wallet
export const createWallet = catchAsync(async (req, res) => {
  const { currency, wallet_type = 'fiat' } = req.body;
  const currencyUpper = currency.toUpperCase();

  // Use INSERT ... ON CONFLICT to make this idempotent.
  // If the wallet already exists (any wallet_type for this currency), return it rather than erroring.
  // This prevents a 500 when the frontend retries wallet creation (e.g. during pending deposit polling).
  const result = await query(
    `INSERT INTO wallets (user_id, currency, wallet_type, balance)
     VALUES ($1, $2, $3, 0)
     ON CONFLICT (user_id, currency, wallet_type) DO UPDATE
       SET updated_at = NOW()
     RETURNING id, currency, wallet_type, balance, is_active, created_at`,
    [req.user.id, currencyUpper, wallet_type]
  );

  const wallet = result.rows[0];
  const isNew = !wallet.updated_at || wallet.created_at >= new Date(Date.now() - 2000);

  logger.info(`Wallet ${isNew ? 'created' : 'found'}:`, { userId: req.user.id, currency: currencyUpper, wallet_type });

  res.status(201).json({
    success: true,
    message: isNew ? 'Wallet created successfully' : 'Wallet already exists',
    data: wallet,
  });
});

// Initialize Korapay deposit — generates a real checkout URL and records a pending transaction
export const initializeDeposit = catchAsync(async (req, res) => {
  const { wallet_id, amount, currency = 'NGN' } = req.body;

  if (!wallet_id || !amount || amount <= 0) {
    throw new AppError('wallet_id and amount are required', 400);
  }

  // Verify wallet belongs to user
  const walletResult = await query(
    'SELECT id, currency FROM wallets WHERE id = $1 AND user_id = $2 AND is_active = true',
    [wallet_id, req.user.id]
  );
  if (walletResult.rows.length === 0) throw new AppError('Wallet not found', 404);

  const wallet = walletResult.rows[0];
  const depositCurrency = wallet.currency; // Use the wallet's own currency
  const reference = `DEP-${req.user.id.slice(0, 8)}-${Date.now()}`;
  const korapaySecret = process.env.KORAPAY_SECRET_KEY;
  const frontendUrl = process.env.FRONTEND_URL || 'https://jaxopay.com';

  if (!KORAPAY_CHECKOUT_CURRENCIES.has(depositCurrency)) {
    throw new AppError(
      `Online deposits are currently only available in NGN. Deposit NGN, then convert to ${depositCurrency} using Swap.`,
      400
    );
  }

  // Validate and format amount using decimal.js
  const amountDecimal = validateAmount(amount, 1, 10000000); // Min 1, Max 10M
  const amountForDB = formatForDB(amountDecimal);

  // Record a pending deposit transaction in DB so we can verify it later
  await query(
    `INSERT INTO transactions
       (user_id, to_wallet_id, transaction_type, from_amount, to_amount,
        from_currency, to_currency, net_amount, fee_amount, status, description, reference)
     VALUES ($1, $2, 'deposit', $3, $3, $4, $4, $3, 0, 'pending', 'Wallet deposit', $5)`,
    [req.user.id, wallet_id, amountForDB, depositCurrency, reference]
  );

  if (!korapaySecret || korapaySecret === 'your_korapay_secret_key') {
    // Dev simulation — immediately complete the deposit using transaction
    logger.info('[Wallet] No real Korapay key — simulating instant deposit for dev');

    await transaction(async (client) => {
      await client.query(
        `UPDATE wallets SET balance = balance + $1, available_balance = available_balance + $1, updated_at = NOW() WHERE id = $2`,
        [amountForDB, wallet_id]
      );
      await client.query(
        `UPDATE transactions SET status = 'completed', completed_at = NOW() WHERE reference = $1`,
        [reference]
      );
    });
    return res.status(200).json({
      success: true,
      message: 'Dev mode: deposit completed instantly',
      data: { checkout_url: null, reference, mode: 'simulation', wallet_id, amount, currency: depositCurrency }
    });
  }

  try {
    const profileResult = await query('SELECT first_name, last_name FROM user_profiles WHERE user_id = $1', [req.user.id]);
    const profile = profileResult.rows[0] || {};

    const payload = {
      amount: parseFloat(amountDecimal.toString()), // Convert decimal to float for API
      currency: depositCurrency,
      reference,
      notification_url: buildApiV1Url('/webhooks/korapay'),
      redirect_url: `${frontendUrl}/dashboard/wallets?deposit=pending&ref=${reference}&wallet=${wallet_id}`,
      ...(depositCurrency === 'NGN' ? { merchant_bears_cost: true } : {}),
      customer: {
        name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || req.user.email,
        email: req.user.email,
      },
      metadata: { walletId: wallet_id, userId: req.user.id, reference },
    };

    logger.info(`[Wallet] Korapay deposit payload: ${depositCurrency} ${amount} ref=${reference}`);

    const response = await axios.post(
      'https://api.korapay.com/merchant/api/v1/charges/initialize',
      payload,
      { headers: { Authorization: `Bearer ${korapaySecret}` }, timeout: 15000 }
    );

    const checkoutUrl = response.data?.data?.checkout_url;
    logger.info(`[Wallet] Korapay deposit initialized: ${reference} — ${amount} ${depositCurrency}`);

    res.status(200).json({
      success: true,
      message: 'Deposit checkout initialized',
      data: { checkout_url: checkoutUrl, reference, amount, currency: depositCurrency, wallet_id }
    });
  } catch (err) {
    // Roll back the pending transaction if Korapay init fails
    await query('DELETE FROM transactions WHERE reference = $1 AND status = $2', [reference, 'pending']);
    const providerError = err.response?.data;
    const extErr = providerError?.message || err.message;
    const validationDetails = formatProviderValidationErrors(providerError?.data);
    logger.error('[Wallet] Korapay init error:', err.response?.data || err.message);

    // Provide user-friendly messages for common Korapay errors
    let userMessage = `Payment initialization failed: ${extErr}`;
    if (providerError?.data?.notification_url) {
      userMessage = 'Payment callback URL is misconfigured. Please contact support.';
    } else if (/channel.*not.*enabled|checkout.*payment/i.test(extErr)) {
      userMessage = `Online deposits in ${depositCurrency} are not enabled on this account. Please contact support or deposit in NGN and convert using Swap.`;
    } else if (/collection.*wallet.*not.*found/i.test(extErr)) {
      userMessage = `The ${depositCurrency} collection account is not set up yet. Please deposit in NGN and convert using Swap.`;
    } else if (/issue with your input/i.test(extErr) && validationDetails) {
      userMessage = `Payment initialization failed: ${validationDetails}`;
    } else if (/internal server error|something went wrong|issue with your input/i.test(extErr)) {
      userMessage = depositCurrency === 'NGN'
        ? 'The payment provider encountered an error for NGN deposits. Please try again.'
        : `The payment provider encountered an error for ${depositCurrency} deposits. Please try depositing in NGN instead.`;
    }

    throw new AppError(userMessage, 502);
  }
});

// Verify Korapay deposit — called by frontend after user returns from payment page
// Checks Korapay API for payment status and credits wallet if successful
export const verifyDeposit = catchAsync(async (req, res) => {
  const { reference } = req.body;
  if (!reference) throw new AppError('reference is required', 400);

  // Find deposit transaction
  const txResult = await query(
    'SELECT id, user_id, to_wallet_id, from_amount, to_currency, status FROM transactions WHERE reference = $1',
    [reference]
  );
  if (txResult.rows.length === 0) throw new AppError('Transaction not found', 404);

  const tx = txResult.rows[0];
  if (tx.user_id !== req.user.id) throw new AppError('Unauthorized', 403);
  if (tx.status === 'completed') {
    return res.status(200).json({ success: true, message: 'Already credited', data: { status: 'completed', reference } });
  }
  if (tx.status === 'failed') {
    return res.status(400).json({ success: false, message: 'Payment was not successful', data: { status: 'failed', reference } });
  }

  const korapaySecret = process.env.KORAPAY_SECRET_KEY;

  // If no real key, check if pending (for simulation testing)
  if (!korapaySecret || korapaySecret === 'your_korapay_secret_key') {
    // In dev, mark as completed since we already simulated above
    return res.status(200).json({ success: true, message: 'Dev mode verified', data: { status: 'completed', reference } });
  }

  try {
    // Verify with Korapay
    const response = await axios.get(
      `https://api.korapay.com/merchant/api/v1/charges/${reference}`,
      { headers: { Authorization: `Bearer ${korapaySecret}` }, timeout: 15000 }
    );

    const chargeStatus = response.data?.data?.status;
    logger.info(`[Wallet] Korapay verify ${reference}: ${chargeStatus}`);

    if (chargeStatus === 'success') {
      // Credit the wallet atomically
      await transaction(async (client) => {
        // Check not already credited (race condition guard)
        const currentTx = await client.query('SELECT status FROM transactions WHERE reference = $1 FOR UPDATE', [reference]);
        if (currentTx.rows[0]?.status === 'completed') return;

        const kAmount = response.data?.data?.amount || tx.from_amount;
        const kCurrency = response.data?.data?.currency || tx.to_currency;

        await client.query(
          `UPDATE wallets SET balance = balance + $1, available_balance = available_balance + $1, updated_at = NOW() WHERE id = $2`,
          [kAmount, tx.to_wallet_id]
        );
        await client.query(
          `UPDATE transactions SET status = 'completed', to_amount = $1, completed_at = NOW() WHERE reference = $2`,
          [kAmount, reference]
        );
        logger.info(`[Wallet] ✅ Wallet ${tx.to_wallet_id} credited ${kAmount} ${kCurrency} — ref ${reference}`);
      });

      res.status(200).json({
        success: true,
        message: 'Payment verified and wallet credited!',
        data: { status: 'completed', reference, amount: tx.from_amount, currency: tx.to_currency }
      });
    } else if (chargeStatus === 'failed' || chargeStatus === 'cancelled') {
      await query('UPDATE transactions SET status = $1, failed_at = NOW() WHERE reference = $2', [chargeStatus, reference]);
      res.status(400).json({ success: false, message: 'Payment was not successful', data: { status: chargeStatus } });
    } else {
      res.status(200).json({ success: true, message: 'Payment still processing', data: { status: chargeStatus || 'pending' } });
    }
  } catch (err) {
    logger.error('[Wallet] Korapay verify error:', err.response?.data || err.message);
    throw new AppError(err.response?.data?.message || 'Could not verify payment status. Please contact support.', 500);
  }
});

import ledgerService from '../orchestration/ledger/LedgerService.js';
import complianceEngine from '../orchestration/compliance/ComplianceEngine.js';



// Internal wallet-to-wallet transfer
export const transferBetweenWallets = catchAsync(async (req, res) => {
  const { recipient_email, amount, currency, description } = req.body;

  // 1. Validate amount using decimal.js
  const amountDecimal = validateAmount(amount, 0.01, 10000000);
  const amountForDB = formatForDB(amountDecimal);

  // 2. Comprehensive Compliance Check
  await complianceEngine.validateTransaction(req.user.id, parseFloat(amountDecimal.toString()), 'INTERNAL_TRANSFER');

  // Find recipient by email
  const recipientUser = await query('SELECT id FROM users WHERE email = $1', [recipient_email.toLowerCase()]);
  if (!recipientUser.rows[0]) {
    throw new AppError('Recipient user not found with that email address', 404);
  }
  const recipient_id = recipientUser.rows[0].id;

  if (recipient_id === req.user.id) {
    throw new AppError('You cannot send money to yourself. To swap currencies, use the Global Finance Hub.', 400);
  }

  // 3. Resolve Wallets
  const senderWallet = await query(
    'SELECT id, balance FROM wallets WHERE user_id = $1 AND currency = $2',
    [req.user.id, currency.toUpperCase()]
  );

  const recipientWallet = await query(
    'SELECT id FROM wallets WHERE user_id = $1 AND currency = $2',
    [recipient_id, currency.toUpperCase()]
  );

  if (!senderWallet.rows[0]) {
    throw new AppError(`You don't have a ${currency} wallet`, 404);
  }

  // Check sufficient balance using decimal comparison
  if (!hasSufficientBalance(senderWallet.rows[0].balance, amountForDB)) {
    throw new AppError('Insufficient funds', 400);
  }

  if (!recipientWallet.rows[0]) {
    throw new AppError(`The recipient does not have a ${currency} wallet to receive this transfer.`, 404);
  }

  // 4. Execute via Ledger Service (Atomic movement) - uses decimal internally
  const result = await ledgerService.recordMovement({
    fromWalletId: senderWallet.rows[0].id,
    toWalletId: recipientWallet.rows[0].id,
    amount: amountForDB, // Use formatted decimal
    currency,
    transactionId: crypto.randomUUID(), // In production, this would be the transaction table record ID
    description: description || 'Internal wallet transfer'
  });

  logger.info('Wallet transfer completed via orchestration:', {
    senderId: req.user.id,
    recipientId: recipient_id,
    amount: amountDecimal.toString(),
    currency,
  });

  // 5. Send Email Notifications
  const userProfile = await query('SELECT first_name, last_name FROM user_profiles WHERE user_id = $1', [req.user.id]);
  const firstName = userProfile.rows[0]?.first_name || 'User';

  emailService.sendTransactionEmails({
    id: result.transactionId,
    type: 'Transfer',
    amount: amountDecimal.toString(),
    currency,
    reference: result.transactionId,
    description: description || 'Internal wallet transfer'
  }, {
    name: firstName,
    email: req.user.email
  }).catch(err => logger.error('Failed to send transfer email:', err));

  res.status(200).json({
    success: true,
    message: 'Transfer completed successfully',
    data: {
      ...result,
      amount: amountDecimal.toString(), // Send as string to avoid float conversion
    },
  });
});

// Get wallet balance
export const getBalance = catchAsync(async (req, res) => {
  const { walletId } = req.params;

  const result = await query(
    `SELECT currency, balance, wallet_type
     FROM wallets
     WHERE id = $1 AND user_id = $2`,
    [walletId, req.user.id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Wallet not found', 404);
  }

  res.status(200).json({
    success: true,
    data: result.rows[0],
  });
});

// Get all balances summary
export const getAllBalances = catchAsync(async (req, res) => {
  const result = await query(
    `SELECT currency, wallet_type, SUM(balance) as total_balance
     FROM wallets
     WHERE user_id = $1 AND is_active = true
     GROUP BY currency, wallet_type
     ORDER BY currency`,
    [req.user.id]
  );

  res.status(200).json({
    success: true,
    data: result.rows,
  });
});

// Freeze/Unfreeze wallet
export const toggleWalletStatus = catchAsync(async (req, res) => {
  const { walletId } = req.params;
  const { is_active } = req.body;

  const result = await query(
    `UPDATE wallets
     SET is_active = $1, updated_at = NOW()
     WHERE id = $2 AND user_id = $3
     RETURNING id, currency, is_active`,
    [is_active, walletId, req.user.id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Wallet not found', 404);
  }

  logger.info('Wallet status changed:', {
    userId: req.user.id,
    walletId,
    is_active,
  });

  res.status(200).json({
    success: true,
    message: `Wallet ${is_active ? 'activated' : 'deactivated'} successfully`,
    data: result.rows[0],
  });
});

// Get wallet transaction history
export const getWalletTransactions = catchAsync(async (req, res) => {
  const { walletId } = req.params;
  const { page = 1, limit = 20, type, status } = req.query;

  const offset = (page - 1) * limit;

  // Build query conditions
  let conditions = 'WHERE wt.wallet_id = $1';
  const params = [walletId];
  let paramCount = 1;

  if (type) {
    paramCount++;
    conditions += ` AND wt.transaction_type = $${paramCount}`;
    params.push(type);
  }

  if (status) {
    paramCount++;
    conditions += ` AND wt.status = $${paramCount}`;
    params.push(status);
  }

  // Verify wallet belongs to user
  const walletCheck = await query(
    'SELECT id FROM wallets WHERE id = $1 AND user_id = $2',
    [walletId, req.user.id]
  );

  if (walletCheck.rows.length === 0) {
    throw new AppError('Wallet not found', 404);
  }

  // Get transactions
  const result = await query(
    `SELECT wt.id, wt.transaction_type, wt.from_amount as amount, wt.from_currency as currency, wt.status,
            wt.description, wt.metadata, wt.created_at
     FROM transactions wt
     ${conditions.replace('wt.wallet_id = $1', '(wt.from_wallet_id = $1 OR wt.to_wallet_id = $1)')}
     ORDER BY wt.created_at DESC
     LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
    [...params, limit, offset]
  );

  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) as total FROM transactions wt ${conditions.replace('wt.wallet_id = $1', '(wt.from_wallet_id = $1 OR wt.to_wallet_id = $1)')}`,
    params
  );

  res.status(200).json({
    success: true,
    data: {
      transactions: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit),
      },
    },
  });
});

// Add funds to wallet (for testing/admin)
export const addFunds = catchAsync(async (req, res) => {
  const { walletId } = req.params;
  const { amount, description = 'Funds added' } = req.body;

  if (amount <= 0) {
    throw new AppError('Amount must be greater than zero', 400);
  }

  const result = await transaction(async (client) => {
    // 1. Get destination wallet
    const walletRes = await client.query(
      'SELECT id, currency FROM wallets WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [walletId, req.user.id]
    );
    if (walletRes.rows.length === 0) throw new AppError('Wallet not found', 404);
    const destWallet = walletRes.rows[0];

    // 2. Find system wallet for source
    const systemRes = await client.query(
      'SELECT id FROM wallets WHERE user_id = (SELECT id FROM users WHERE email = \'system@jaxopay.com\') AND currency = $1 AND wallet_type = \'system\'',
      [destWallet.currency]
    );
    if (systemRes.rows.length === 0) throw new AppError('System liquidity not available for this currency', 500);
    const systemWalletId = systemRes.rows[0].id;

    // 3. Record movement via ledger service
    await ledgerService.recordMovement({
      fromWalletId: systemWalletId,
      toWalletId: walletId,
      amount,
      currency: destWallet.currency,
      transactionId: `DEP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      description: description || 'External deposit',
      metadata: { source: 'admin_manual' }
    }, client);

    // 4. Create transaction record (for history)
    await client.query(
      `INSERT INTO transactions
       (user_id, from_wallet_id, to_wallet_id, transaction_type, from_amount, from_currency, status, description, reference)
       VALUES ($1, $2, $3, 'deposit', $4, $5, 'completed', $6, $7)`,
      [req.user.id, systemWalletId, walletId, amount, destWallet.currency, description, 'REF-' + Date.now()]
    );

    // Get updated balance
    const updated = await client.query('SELECT balance FROM wallets WHERE id = $1', [walletId]);
    return { balance: updated.rows[0].balance, currency: destWallet.currency };
  });

  logger.info('Funds added to wallet:', {
    userId: req.user.id,
    walletId,
    amount,
  });

  // 5. Send Notification
  const userProfile = await query('SELECT first_name, last_name FROM user_profiles WHERE user_id = $1', [req.user.id]);
  const firstName = userProfile.rows[0]?.first_name || 'User';

  emailService.sendTransactionEmails({
    id: 'DEP-' + Date.now(),
    type: 'Wallet Top Up',
    amount,
    currency: result.currency,
    reference: 'REF-' + Date.now(),
    description
  }, {
    name: firstName,
    email: req.user.email
  }).catch(err => logger.error('Failed to send deposit email:', err));

  res.status(200).json({
    success: true,
    message: 'Funds added successfully',
    data: result,
  });
});


// ─────────────────────────────────────────────────────────────────────
// Virtual Bank Account (VBA) — Korapay
// Gives each user a real NUBAN so they can receive bank transfers
// ─────────────────────────────────────────────────────────────────────

/**
 * GET /wallets/vba/:walletId
 * Returns existing VBA for wallet, or creates one on-the-fly via Korapay
 */
export const getOrCreateVBA = catchAsync(async (req, res) => {
  const { walletId } = req.params;

  // Verify wallet belongs to user
  const walletResult = await query(
    'SELECT id, currency FROM wallets WHERE id = $1 AND user_id = $2 AND is_active = true',
    [walletId, req.user.id]
  );
  if (walletResult.rows.length === 0) throw new AppError('Wallet not found', 404);
  const wallet = walletResult.rows[0];

  // Check if VBA already exists in DB
  const existingVBA = await query(
    'SELECT * FROM virtual_bank_accounts WHERE wallet_id = $1 AND is_active = true',
    [walletId]
  );

  if (existingVBA.rows.length > 0) {
    return res.status(200).json({
      success: true,
      data: existingVBA.rows[0],
    });
  }

  // No VBA yet — create one via Korapay
  const korapaySecret = process.env.KORAPAY_SECRET_KEY;
  if (!korapaySecret || korapaySecret.includes('your_')) {
    throw new AppError('Payment provider not configured. Please contact support.', 503);
  }

  // Get user profile for the account name
  const profileResult = await query(
    'SELECT first_name, last_name FROM user_profiles WHERE user_id = $1',
    [req.user.id]
  );
  const profile = profileResult.rows[0] || {};
  const accountName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'JAXOPAY User';
  const accountRef = `JXVBA-${req.user.id.slice(0, 8)}-${wallet.currency}`;

  try {
    const koraPayload = {
      account_name: accountName,
      account_reference: accountRef.replace(/[^a-zA-Z0-9]/g, ''), // Ensure alphanumeric
      permanent: true,
      bank_code: '035',  // Wema Bank (widely supported for VBA)
      customer: {
        name: accountName,
        email: req.user.email,
      },
    };

    logger.info(`[VBA] Creating Korapay VBA for ${req.user.email}: ref=${koraPayload.account_reference}`);

    let vbaData;

    // Check if we are using a test key or if we should attempt a real call
    if (korapaySecret.includes('test')) {
      // Mock response for Sandbox/Test environments
      vbaData = {
        account_name: accountName,
        account_number: '8' + Math.floor(Math.random() * 1000000000).toString().padStart(9, '0'),
        bank_name: 'Wema Bank (Sandbox)',
        bank_code: '035',
        account_reference: koraPayload.account_reference
      };
      logger.info('[VBA] Sandbox Mode: Returning Mock Virtual Bank Account');
    } else {
      const response = await axios.post(
        'https://api.korapay.com/merchant/api/v1/virtual-bank-account',
        koraPayload,
        {
          headers: { Authorization: `Bearer ${korapaySecret}`, 'Content-Type': 'application/json' },
          timeout: 30000,
        }
      );
      vbaData = response.data?.data;
    }

    if (!vbaData?.account_number) {
      logger.error('[VBA] Korapay did not return account_number:', vbaData);
      throw new AppError('Could not generate virtual account. Please try again.', 502);
    }

    // Persist to DB
    const insertResult = await query(
      `INSERT INTO virtual_bank_accounts
         (user_id, wallet_id, account_name, account_number, bank_name, bank_code,
          provider, provider_reference, currency, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, 'korapay', $7, $8, true)
       RETURNING *`,
      [
        req.user.id,
        walletId,
        vbaData.account_name || accountName,
        vbaData.account_number,
        vbaData.bank_name || 'Wema Bank',
        vbaData.bank_code || '035',
        vbaData.account_reference || koraPayload.account_reference,
        wallet.currency,
      ]
    );

    logger.info(`[VBA] ✅ Created VBA ${vbaData.account_number} for wallet ${walletId}`);

    res.status(200).json({
      success: true,
      message: 'Virtual account created successfully',
      data: insertResult.rows[0],
    });

  } catch (error) {
    logger.error('Korapay VBA Error:', error.response?.data || error);

    // Ultimate Fallback for any other API failures when testing
    if (process.env.NODE_ENV !== 'production') {
      logger.info('[VBA] API Failed, but returning Mock Fallback since not in production.');
      const mockVbaData = {
        account_name: accountName,
        account_number: '7' + Math.floor(Math.random() * 1000000000).toString().padStart(9, '0'),
        bank_name: 'Mock Bank (Error Fallback)',
        bank_code: '000',
        account_reference: accountRef.replace(/[^a-zA-Z0-9]/g, '')
      };
      const insertResult = await query(
        `INSERT INTO virtual_bank_accounts
               (user_id, wallet_id, account_name, account_number, bank_name, bank_code,
                provider, provider_reference, currency, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, 'korapay_mock', $7, $8, true)
             RETURNING *`,
        [
          req.user.id, walletId, mockVbaData.account_name, mockVbaData.account_number,
          mockVbaData.bank_name, mockVbaData.bank_code, mockVbaData.account_reference, wallet.currency
        ]
      );
      return res.status(200).json({ success: true, data: insertResult.rows[0] });
    }

    // Map the actual Korapay error to a user-friendly message
    const koraMessage = error.response?.data?.message || error.message || '';
    let userMessage = koraMessage || 'Could not create virtual account. Please try again later.';
    if (koraMessage.toLowerCase().includes('not enabled')) {
      userMessage = 'Virtual bank account feature is being activated. Please try again later or contact support.';
    }
    throw new AppError(userMessage, 502);
  }
});
