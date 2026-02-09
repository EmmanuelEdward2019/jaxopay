import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

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

  // Check if wallet already exists
  const existing = await query(
    'SELECT id FROM wallets WHERE user_id = $1 AND currency = $2',
    [req.user.id, currency.toUpperCase()]
  );

  if (existing.rows.length > 0) {
    throw new AppError('Wallet already exists for this currency', 409);
  }

  // Create wallet
  const result = await query(
    `INSERT INTO wallets (user_id, currency, wallet_type, balance)
     VALUES ($1, $2, $3, 0)
     RETURNING id, currency, wallet_type, balance, is_active, created_at`,
    [req.user.id, currency.toUpperCase(), wallet_type]
  );

  logger.info('Wallet created:', { userId: req.user.id, currency, wallet_type });

  res.status(201).json({
    success: true,
    message: 'Wallet created successfully',
    data: result.rows[0],
  });
});

import ledgerService from '../orchestration/ledger/LedgerService.js';
import complianceEngine from '../orchestration/compliance/ComplianceEngine.js';

// Internal wallet-to-wallet transfer
export const transferBetweenWallets = catchAsync(async (req, res) => {
  const { recipient_id, amount, currency, description } = req.body;

  // 1. Validate amount
  if (amount <= 0) {
    throw new AppError('Amount must be greater than zero', 400);
  }

  // 2. Comprehensive Compliance Check
  await complianceEngine.validateTransaction(req.user.id, amount, 'INTERNAL_TRANSFER');

  // 3. Resolve Wallets
  const senderWallet = await query(
    'SELECT id FROM wallets WHERE user_id = $1 AND currency = $2',
    [req.user.id, currency.toUpperCase()]
  );

  const recipientWallet = await query(
    'SELECT id FROM wallets WHERE user_id = $1 AND currency = $2',
    [recipient_id, currency.toUpperCase()]
  );

  if (!senderWallet.rows[0] || !recipientWallet.rows[0]) {
    throw new AppError('Source or destination wallet not found', 404);
  }

  // 4. Execute via Ledger Service (Atomic movement)
  const result = await ledgerService.recordMovement({
    fromWalletId: senderWallet.rows[0].id,
    toWalletId: recipientWallet.rows[0].id,
    amount,
    currency,
    transactionId: crypto.randomUUID(), // In production, this would be the transaction table record ID
    description: description || 'Internal wallet transfer'
  });

  logger.info('Wallet transfer completed via orchestration:', {
    senderId: req.user.id,
    recipientId: recipient_id,
    amount,
    currency,
  });

  res.status(200).json({
    success: true,
    message: 'Transfer completed successfully',
    data: result,
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

  res.status(200).json({
    success: true,
    message: 'Funds added successfully',
    data: result,
  });
});

