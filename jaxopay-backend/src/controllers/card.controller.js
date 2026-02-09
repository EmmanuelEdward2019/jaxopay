import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import OrchestrationLayer, { ledgerService } from '../orchestration/index.js';

// Get all user cards
export const getCards = catchAsync(async (req, res) => {
  const result = await query(
    `SELECT id, card_type, card_last_four, cardholder_name, status,
            balance, spending_limit_daily, spending_limit_monthly,
            expiry_month, expiry_year, created_at
     FROM virtual_cards
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [req.user.id]
  );

  // Transform to match frontend expectations
  const cards = result.rows.map(card => ({
    ...card,
    last_four: card.card_last_four,
    card_status: card.status,
    spending_limit: card.spending_limit_daily,
  }));

  res.status(200).json({
    success: true,
    data: cards,
  });
});

// Get single card details
export const getCard = catchAsync(async (req, res) => {
  const { cardId } = req.params;

  const result = await query(
    `SELECT id, card_type, card_number_encrypted, cvv_encrypted, card_last_four,
            cardholder_name, status, balance, spending_limit_daily,
            spending_limit_monthly, expiry_month, expiry_year, created_at
     FROM virtual_cards
     WHERE id = $1 AND user_id = $2`,
    [cardId, req.user.id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Card not found', 404);
  }

  // Transform for frontend
  const card = {
    ...result.rows[0],
    last_four: result.rows[0].card_last_four,
    card_status: result.rows[0].status,
  };

  res.status(200).json({
    success: true,
    data: card,
  });
});

// Create new virtual card
export const createCard = catchAsync(async (req, res) => {
  const { card_type, currency, spending_limit, billing_address } = req.body;

  // Check KYC tier (Tier 2+ required for cards)
  if (req.user.kyc_tier < 2) {
    throw new AppError(
      'KYC Tier 2 or higher required to create virtual cards',
      403
    );
  }

  // Check if user has reached card limit
  const cardCount = await query(
    `SELECT COUNT(*) as count FROM virtual_cards
     WHERE user_id = $1 AND status != 'terminated'`,
    [req.user.id]
  );

  const maxCards = req.user.kyc_tier === 2 ? 3 : 10;
  if (parseInt(cardCount.rows[0].count) >= maxCards) {
    throw new AppError(`Maximum ${maxCards} cards allowed for your tier`, 400);
  }

  // 4. Create card via Orchestration
  const providerResult = await OrchestrationLayer.createCard({
    userId: req.user.id,
    card_type,
    currency: currency.toUpperCase(),
    spending_limit
  });

  const cardNumber = providerResult.card_number || generateCardNumber();
  const cvv = providerResult.cvv || generateCVV();
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 3);

  const result = await query(
    `INSERT INTO virtual_cards
     (user_id, card_type, card_brand, card_number, cvv, last_four,
      card_status, currency, balance, spending_limit, billing_address, expires_at)
     VALUES ($1, $2, 'visa', $3, $4, $5, 'active', $6, 0, $7, $8, $9)
     RETURNING id, card_type, card_brand, last_four, card_status, currency,
               balance, spending_limit, created_at, expires_at`,
    [
      req.user.id,
      card_type,
      cardNumber,
      cvv,
      cardNumber.slice(-4),
      currency.toUpperCase(),
      spending_limit || 1000,
      JSON.stringify(billing_address),
      expiresAt,
    ]
  );

  logger.info('Virtual card created:', {
    userId: req.user.id,
    cardId: result.rows[0].id,
  });

  res.status(201).json({
    success: true,
    message: 'Virtual card created successfully',
    data: result.rows[0],
  });
});

// Fund card from wallet
export const fundCard = catchAsync(async (req, res) => {
  const { cardId } = req.params;
  const { amount } = req.body;

  if (amount <= 0) {
    throw new AppError('Amount must be greater than 0', 400);
  }

  const result = await transaction(async (client) => {
    // Get card with lock
    const card = await client.query(
      `SELECT id, user_id, balance, status, spending_limit_daily
       FROM virtual_cards
       WHERE id = $1
       FOR UPDATE`,
      [cardId]
    );

    if (card.rows.length === 0) {
      throw new AppError('Card not found', 404);
    }

    if (card.rows[0].user_id !== req.user.id) {
      throw new AppError('Unauthorized', 403);
    }

    if (card.rows[0].status !== 'active') {
      throw new AppError('Card is not active', 400);
    }

    // Check if funding would exceed spending limit
    const newBalance = parseFloat(card.rows[0].balance) + amount;
    const spendingLimit = parseFloat(card.rows[0].spending_limit_daily) || 10000;
    if (newBalance > spendingLimit) {
      throw new AppError('Funding would exceed card spending limit', 400);
    }

    // Get user USD wallet with lock (cards are always USD)
    const wallet = await client.query(
      `SELECT id, balance FROM wallets
       WHERE user_id = $1 AND currency = 'USD'
       FOR UPDATE`,
      [req.user.id]
    );

    if (wallet.rows.length === 0) {
      throw new AppError(`No ${card.rows[0].currency} wallet found`, 404);
    }

    if (parseFloat(wallet.rows[0].balance) < amount) {
      throw new AppError('Insufficient wallet balance', 400);
    }

    // Use Ledger Service for atomic movement
    const poolRes = await client.query(
      'SELECT id FROM wallets WHERE user_id = (SELECT id FROM users WHERE email = \'cards-system@jaxopay.com\') AND currency = \'USD\''
    );
    if (poolRes.rows.length === 0) throw new AppError('Card financing pool not initialized', 500);
    const cardPoolWalletId = poolRes.rows[0].id;

    await ledgerService.recordMovement({
      fromWalletId: wallet.rows[0].id,
      toWalletId: cardPoolWalletId,
      amount,
      currency: 'USD',
      transactionId: `CARD-FUND-${Date.now()}`,
      description: 'Funding virtual card',
      metadata: { card_id: cardId }
    }, client);

    // Add to card balance in virtual_cards table
    await client.query(
      'UPDATE virtual_cards SET balance = balance + $1, updated_at = NOW() WHERE id = $2',
      [amount, cardId]
    );

    // Create record in transactions table
    await client.query(
      `INSERT INTO transactions
       (user_id, from_wallet_id, transaction_type, from_amount, from_currency, status, description, reference)
       VALUES ($1, $2, 'card_funding', $3, $4, 'completed', 'Card funding', $5)`,
      [req.user.id, wallet.rows[0].id, amount, 'USD', 'REF-' + Date.now()]
    );

    return { newBalance };
  });

  logger.info('Card funded:', { userId: req.user.id, cardId, amount });

  res.status(200).json({
    success: true,
    message: 'Card funded successfully',
    data: {
      new_balance: result.newBalance,
    },
  });
});

// Freeze card
export const freezeCard = catchAsync(async (req, res) => {
  const { cardId } = req.params;

  const result = await query(
    `UPDATE virtual_cards
     SET status = 'frozen', frozen_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'active'
     RETURNING id, status`,
    [cardId, req.user.id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Card not found or already frozen', 404);
  }

  logger.info('Card frozen:', { userId: req.user.id, cardId });

  res.status(200).json({
    success: true,
    message: 'Card frozen successfully',
    data: { ...result.rows[0], card_status: result.rows[0].status },
  });
});

// Unfreeze card
export const unfreezeCard = catchAsync(async (req, res) => {
  const { cardId } = req.params;

  const result = await query(
    `UPDATE virtual_cards
     SET status = 'active', frozen_at = NULL, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'frozen'
     RETURNING id, status`,
    [cardId, req.user.id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Card not found or not frozen', 404);
  }

  logger.info('Card unfrozen:', { userId: req.user.id, cardId });

  res.status(200).json({
    success: true,
    message: 'Card unfrozen successfully',
    data: { ...result.rows[0], card_status: result.rows[0].status },
  });
});

// Terminate card
export const terminateCard = catchAsync(async (req, res) => {
  const { cardId } = req.params;

  const result = await transaction(async (client) => {
    // Get card with lock
    const card = await client.query(
      `SELECT id, user_id, balance, status
       FROM virtual_cards
       WHERE id = $1
       FOR UPDATE`,
      [cardId]
    );

    if (card.rows.length === 0) {
      throw new AppError('Card not found', 404);
    }

    if (card.rows[0].user_id !== req.user.id) {
      throw new AppError('Unauthorized', 403);
    }

    if (card.rows[0].status === 'terminated') {
      throw new AppError('Card already terminated', 400);
    }

    // If card has balance, refund to USD wallet
    if (parseFloat(card.rows[0].balance) > 0) {
      const wallet = await client.query(
        `SELECT id FROM wallets
         WHERE user_id = $1 AND currency = 'USD'`,
        [req.user.id]
      );

      if (wallet.rows.length > 0) {
        await client.query(
          'UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2',
          [card.rows[0].balance, wallet.rows[0].id]
        );

        await client.query(
          `INSERT INTO wallet_ledger
           (wallet_id, entry_type, amount, balance_before, balance_after, description, metadata)
           VALUES ($1, 'credit', $2, 0, 0, 'Card termination refund', $3)`,
          [
            wallet.rows[0].id,
            card.rows[0].balance,
            JSON.stringify({ card_id: cardId }),
          ]
        );
      }
    }

    // Terminate card
    await client.query(
      `UPDATE virtual_cards
       SET status = 'terminated', terminated_at = NOW(), balance = 0, updated_at = NOW()
       WHERE id = $1`,
      [cardId]
    );

    return { refunded: card.rows[0].balance };
  });

  logger.info('Card terminated:', { userId: req.user.id, cardId });

  res.status(200).json({
    success: true,
    message: 'Card terminated successfully',
    data: {
      refunded_amount: result.refunded,
    },
  });
});

// Get card transactions
export const getCardTransactions = catchAsync(async (req, res) => {
  const { cardId } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  // Verify card ownership
  const cardCheck = await query(
    'SELECT id FROM virtual_cards WHERE id = $1 AND user_id = $2',
    [cardId, req.user.id]
  );

  if (cardCheck.rows.length === 0) {
    throw new AppError('Card not found', 404);
  }

  const result = await query(
    `SELECT id, transaction_type, amount, currency, merchant_name,
            merchant_category, status, created_at
     FROM card_transactions
     WHERE card_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [cardId, limit, offset]
  );

  const countResult = await query(
    'SELECT COUNT(*) as total FROM card_transactions WHERE card_id = $1',
    [cardId]
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

// Update card spending limit
export const updateSpendingLimit = catchAsync(async (req, res) => {
  const { cardId } = req.params;
  const { spending_limit } = req.body;

  if (spending_limit <= 0) {
    throw new AppError('Spending limit must be greater than 0', 400);
  }

  const result = await query(
    `UPDATE virtual_cards
     SET spending_limit = $1, updated_at = NOW()
     WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
     RETURNING id, spending_limit`,
    [spending_limit, cardId, req.user.id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Card not found', 404);
  }

  logger.info('Card spending limit updated:', {
    userId: req.user.id,
    cardId,
    newLimit: spending_limit,
  });

  res.status(200).json({
    success: true,
    message: 'Spending limit updated successfully',
    data: result.rows[0],
  });
});

// Helper functions (in production, these would be more sophisticated)
function generateCardNumber() {
  // Generate a valid-looking card number (not real)
  return '4111' + Math.random().toString().slice(2, 14);
}

function generateCVV() {
  return Math.floor(100 + Math.random() * 900).toString();
}

