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

// Internal wallet-to-wallet transfer
export const transferBetweenWallets = catchAsync(async (req, res) => {
  const { recipient_id, amount, currency, description } = req.body;

  // Validate amount
  if (amount <= 0) {
    throw new AppError('Amount must be greater than zero', 400);
  }

  // Execute transfer in transaction
  const result = await transaction(async (client) => {
    // Get sender wallet
    const senderWallet = await client.query(
      `SELECT id, balance, is_active FROM wallets
       WHERE user_id = $1 AND currency = $2
       FOR UPDATE`,
      [req.user.id, currency.toUpperCase()]
    );

    if (senderWallet.rows.length === 0) {
      throw new AppError('Sender wallet not found', 404);
    }

    if (!senderWallet.rows[0].is_active) {
      throw new AppError('Sender wallet is not active', 403);
    }

    if (parseFloat(senderWallet.rows[0].balance) < amount) {
      throw new AppError('Insufficient balance', 400);
    }

    // Get recipient wallet
    const recipientWallet = await client.query(
      `SELECT id, is_active FROM wallets
       WHERE user_id = $1 AND currency = $2
       FOR UPDATE`,
      [recipient_id, currency.toUpperCase()]
    );

    if (recipientWallet.rows.length === 0) {
      throw new AppError('Recipient wallet not found', 404);
    }

    if (!recipientWallet.rows[0].is_active) {
      throw new AppError('Recipient wallet is not active', 403);
    }

    // Deduct from sender
    await client.query(
      'UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2',
      [amount, senderWallet.rows[0].id]
    );

    // Add to recipient
    await client.query(
      'UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2',
      [amount, recipientWallet.rows[0].id]
    );

    // Create transaction record
    const txResult = await client.query(
      `INSERT INTO wallet_transactions 
       (wallet_id, transaction_type, amount, currency, status, description, metadata)
       VALUES ($1, 'transfer_out', $2, $3, 'completed', $4, $5)
       RETURNING id, created_at`,
      [
        senderWallet.rows[0].id,
        amount,
        currency.toUpperCase(),
        description || 'Wallet transfer',
        JSON.stringify({ recipient_id, recipient_wallet_id: recipientWallet.rows[0].id }),
      ]
    );

    // Create recipient transaction record
    await client.query(
      `INSERT INTO wallet_transactions 
       (wallet_id, transaction_type, amount, currency, status, description, metadata)
       VALUES ($1, 'transfer_in', $2, $3, 'completed', $4, $5)`,
      [
        recipientWallet.rows[0].id,
        amount,
        currency.toUpperCase(),
        description || 'Wallet transfer',
        JSON.stringify({ sender_id: req.user.id, sender_wallet_id: senderWallet.rows[0].id }),
      ]
    );

    return txResult.rows[0];
  });

  logger.info('Wallet transfer completed:', {
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
    `SELECT wt.id, wt.transaction_type, wt.amount, wt.currency, wt.status,
            wt.description, wt.metadata, wt.created_at
     FROM wallet_transactions wt
     ${conditions}
     ORDER BY wt.created_at DESC
     LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
    [...params, limit, offset]
  );

  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) as total FROM wallet_transactions wt ${conditions}`,
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
    // Update wallet balance
    const walletResult = await client.query(
      `UPDATE wallets
       SET balance = balance + $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING id, currency, balance`,
      [amount, walletId, req.user.id]
    );

    if (walletResult.rows.length === 0) {
      throw new AppError('Wallet not found', 404);
    }

    // Create transaction record
    await client.query(
      `INSERT INTO wallet_transactions
       (wallet_id, transaction_type, amount, currency, status, description)
       VALUES ($1, 'deposit', $2, $3, 'completed', $4)`,
      [walletId, amount, walletResult.rows[0].currency, description]
    );

    return walletResult.rows[0];
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

