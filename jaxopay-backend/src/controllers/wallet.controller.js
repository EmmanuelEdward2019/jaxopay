import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import emailService from '../services/email.service.js';
import axios from 'axios';
import crypto from 'crypto';
import { decimal, validateAmount, formatForDB, hasSufficientBalance } from '../utils/financial.js';
import QuidaxAdapter from '../orchestration/adapters/crypto/QuidaxAdapter.js';
import KorapayAdapter from '../orchestration/adapters/fiat/KorapayAdapter.js';

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
     ON CONFLICT (user_id, currency) DO UPDATE
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

  const KORAPAY_CHECKOUT_CURRENCIES = new Set(
    (process.env.KORAPAY_CHECKOUT_CURRENCIES || 'NGN')
      .split(',')
      .map((curr) => curr.trim().toUpperCase())
      .filter(Boolean)
  );

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

  if (!korapaySecret || korapaySecret.includes('your_')) {
    // Dev simulation — immediately complete the deposit using transaction
    logger.info('[Wallet] No real Korapay key — simulating instant deposit for dev');

    await transaction(async (client) => {
      await client.query(
        `UPDATE wallets SET balance = balance + $1, available_balance = COALESCE(available_balance, 0) + $1, updated_at = NOW() WHERE id = $2`,
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

    logger.info(`[Wallet] Korapay checkout payload: ${depositCurrency} ${amount} ref=${reference}`);

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
    const extErr = err.response?.data?.message || err.message;
    logger.error('[Wallet] Korapay init error:', err.response?.data || err.message);

    throw new AppError(`Payment initialization failed: ${extErr}`, 502);
  }
});

// Verify Korapay deposit
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
  if (!korapaySecret || korapaySecret.includes('your_')) {
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
      // Credit the wallet atomically. `credited` is only set when THIS call performs
      // the credit, so the email fires exactly once (the webhook path guards the same way).
      let credited = null;
      await transaction(async (client) => {
        // Check not already credited (race condition guard)
        const currentTx = await client.query('SELECT status FROM transactions WHERE reference = $1 FOR UPDATE', [reference]);
        if (currentTx.rows[0]?.status === 'completed') return;

        const kAmount = response.data?.data?.amount || tx.from_amount;
        const kCurrency = response.data?.data?.currency || tx.to_currency;

        await client.query(
          `UPDATE wallets SET balance = balance + $1, available_balance = COALESCE(available_balance, 0) + $1, updated_at = NOW() WHERE id = $2`,
          [kAmount, tx.to_wallet_id]
        );
        await client.query(
          `UPDATE transactions SET status = 'completed', to_amount = $1, completed_at = NOW() WHERE reference = $2`,
          [kAmount, reference]
        );
        credited = { amount: kAmount, currency: kCurrency };
        logger.info(`[Wallet] ✅ Wallet ${tx.to_wallet_id} credited ${kAmount} ${kCurrency} — ref ${reference}`);
      });

      // Notify user + admin (only when this request actually credited the wallet)
      if (credited) {
        // Record double-entry ledger movement + system float (non-fatal, after commit)
        ledgerService.recordDepositEntries({
          userWalletId: tx.to_wallet_id,
          amount: credited.amount,
          transactionId: reference,
          description: 'Wallet Funding',
        }).catch((e) => logger.error('[Wallet] deposit ledger error:', e.message));

        try {
          const userRes = await query(
            `SELECT COALESCE(up.first_name || ' ' || up.last_name, up.first_name, u.email) AS name, u.email
             FROM users u
             LEFT JOIN user_profiles up ON up.user_id = u.id
             WHERE u.id = $1`,
            [tx.user_id]
          );
          if (userRes.rows.length > 0) {
            emailService.sendTransactionEmails({
              id: reference,
              type: 'Deposit',
              amount: credited.amount,
              currency: credited.currency,
              reference,
              details: 'Wallet Funding',
            }, userRes.rows[0]).catch((e) => logger.error('[Wallet] verify deposit email error:', e.message));
          }
        } catch (e) {
          logger.error('[Wallet] verify deposit notify error:', e.message);
        }
      }

      res.status(200).json({
        success: true,
        message: 'Payment verified and credited',
        data: { status: 'completed', reference }
      });
    } else if (chargeStatus === 'failed') {
      await query(`UPDATE transactions SET status = 'failed', updated_at = NOW() WHERE reference = $1`, [reference]);
      res.status(400).json({ success: false, message: 'Payment failed', data: { status: 'failed' } });
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
    details: description || 'Internal wallet transfer'
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
    `WITH combined AS (
      SELECT id, transaction_type::varchar, from_amount::numeric as amount, from_currency::varchar as currency, status::varchar, description::text, metadata, created_at, from_wallet_id as w_id1, to_wallet_id as w_id2
      FROM transactions
      UNION ALL
      SELECT id, transaction_type::varchar, amount::numeric, currency::varchar, status::varchar, description::text, metadata, created_at, wallet_id as w_id1, wallet_id as w_id2
      FROM wallet_transactions wtx
      WHERE NOT EXISTS (
        SELECT 1 FROM transactions t
        WHERE (wtx.metadata->>'quidax_tx_id') IS NOT NULL
          AND (t.metadata->>'quidax_tx_id') = (wtx.metadata->>'quidax_tx_id')
      )
     )
     SELECT id, transaction_type, amount, currency, status, description, metadata, created_at
     FROM combined
     WHERE w_id1 = $1 OR w_id2 = $1
     ${type ? ' AND transaction_type = $' + paramCount : ''}
     ${status ? ' AND status = $' + (type ? paramCount + 1 : paramCount) : ''}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  // Get total count
  const countResult = await query(
    `WITH combined AS (
      SELECT id, transaction_type::varchar, status::varchar, from_wallet_id as w_id1, to_wallet_id as w_id2 FROM transactions
      UNION ALL
      SELECT id, transaction_type::varchar, status::varchar, wallet_id as w_id1, wallet_id as w_id2 FROM wallet_transactions wtx WHERE NOT EXISTS (
        SELECT 1 FROM transactions t
        WHERE (wtx.metadata->>'quidax_tx_id') IS NOT NULL
          AND (t.metadata->>'quidax_tx_id') = (wtx.metadata->>'quidax_tx_id')
      )
     )
     SELECT COUNT(*) as total FROM combined
     WHERE w_id1 = $1 OR w_id2 = $1
     ${type ? ' AND transaction_type = $' + paramCount : ''}
     ${status ? ' AND status = $' + (type ? paramCount + 1 : paramCount) : ''}`,
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
    details: description
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
// Virtual Bank Account (VBA)
// ─────────────────────────────────────────────────────────────────────

/**
 * GET /wallets/vba/:walletId
 * Returns the Virtual Bank Account (VBA) / NGN deposit details for a fiat wallet.
 *
 * Per Quidax docs v3.0: NGN deposits are made via a dedicated bank account
 * tied to the sub-user's NGN wallet. The bank account details are returned
 * inside the wallet object at GET /users/{id}/wallets/ngn.
 */
export const getOrCreateVBA = catchAsync(async (req, res) => {
  const { walletId } = req.params;

  // 1. Verify wallet belongs to user and is NGN
  const walletResult = await query(
    'SELECT id, currency FROM wallets WHERE id = $1 AND user_id = $2 AND is_active = true',
    [walletId, req.user.id]
  );

  if (walletResult.rows.length === 0) {
    throw new AppError('Wallet not found', 404);
  }

  const wallet = walletResult.rows[0];

  if (wallet.currency.toUpperCase() !== 'NGN') {
    throw new AppError('Virtual bank accounts are only available for NGN wallets.', 400);
  }

  // 2. Look up existing VBA in our local database
  try {
    const vbaResult = await query(
      'SELECT bank_name, account_number, account_name FROM virtual_bank_accounts WHERE user_id = $1 AND is_active = true',
      [req.user.id]
    );

    if (vbaResult.rows.length > 0) {
      return res.status(200).json({
        success: true,
        data: vbaResult.rows[0],
      });
    }

    // 3. No existing VBA. Check if Korapay keys are configured.
    if (!process.env.KORAPAY_SECRET_KEY) {
      logger.warn(`[VBA] KORAPAY_SECRET_KEY not set. Cannot generate fiat account for ${req.user.id}.`);
      return res.status(200).json({
        success: true,
        pending: true,
        data: {
          bank_name: 'Pending Activation',
          account_number: 'Payment processor not configured.',
          account_name: req.user.email,
        }
      });
    }

    // 4. Fetch user profile to pass to Korapay
    const profileResult = await query('SELECT first_name, last_name FROM user_profiles WHERE user_id = $1', [req.user.id]);
    const profile = profileResult.rows[0] || {};
    const firstName = profile.first_name || 'User';
    const lastName = profile.last_name || 'Account';

    // 5. Create new VBA via Korapay
    logger.info(`[VBA] Generating new Korapay Virtual Bank Account for user ${req.user.id}`);
    const vbaData = await KorapayAdapter.createVirtualBankAccount({
      reference: `VBA-${req.user.id.slice(0, 8)}-${Date.now()}`,
      account_name: `${firstName} ${lastName}`,
      customer_name: `${firstName} ${lastName}`,
      customer_email: req.user.email
    });

    // 6. Save new VBA to our database
    await query(
      `INSERT INTO virtual_bank_accounts (wallet_id, user_id, account_number, bank_name, account_name, provider, provider_reference)
       VALUES ($1, $2, $3, $4, $5, 'korapay', $6)`,
      [wallet.id, req.user.id, vbaData.account_number, vbaData.bank_name, vbaData.account_name, vbaData.reference]
    );

    return res.status(200).json({
      success: true,
      data: {
        bank_name: vbaData.bank_name,
        account_number: vbaData.account_number,
        account_name: vbaData.account_name,
      },
    });

  } catch (error) {
    logger.error(`[VBA] Error generating NGN virtual bank account for ${req.user.id}: ${error.message}`);
    
    // Return a graceful error
    return res.status(200).json({
      success: false,
      error: 'Could not generate virtual bank account details. Please try again or contact support.',
    });
  }
});

