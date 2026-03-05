import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import emailService from '../services/email.service.js';
import GraphAdapter from '../orchestration/adapters/cards/GraphAdapter.js';
import { ledgerService } from '../orchestration/index.js';

const graph = new GraphAdapter();

// ─────────────────────────────────────────────
// GET /cards
// ─────────────────────────────────────────────
export const getCards = catchAsync(async (req, res) => {
  const result = await query(
    `SELECT id, card_type, card_number_encrypted, cvv_encrypted, card_last_four, cardholder_name,
            status, balance, spending_limit_daily, spending_limit_monthly,
            expiry_month, expiry_year, provider_card_id, metadata, created_at
     FROM virtual_cards
     WHERE user_id = $1 AND status != 'terminated'
     ORDER BY created_at DESC`,
    [req.user.id]
  );

  const cards = result.rows.map(c => ({
    ...c,
    currency: c.metadata?.currency || 'USD',
    card_brand: c.metadata?.card_brand || 'visa',
    last_four: c.card_last_four,
    card_status: c.status,
    spending_limit: c.spending_limit_daily,
    // Expose card details — card_number_encrypted stores the actual PAN in this system
    card_number: c.card_number_encrypted || null,
    cvv: c.cvv_encrypted || null,
    expiry_date: c.expiry_month && c.expiry_year
      ? `${String(c.expiry_month).padStart(2, '0')}/${c.expiry_year}`
      : null,
    billing_address: c.metadata?.billing_address || null,
  }));

  res.status(200).json({ success: true, data: cards });
});

// ─────────────────────────────────────────────
// GET /cards/:cardId
// ─────────────────────────────────────────────
export const getCard = catchAsync(async (req, res) => {
  const { cardId } = req.params;
  const result = await query(
    `SELECT id, card_type, card_number_encrypted, cvv_encrypted, card_last_four, cardholder_name,
            status, balance, spending_limit_daily, spending_limit_monthly,
            expiry_month, expiry_year, provider_card_id, metadata, created_at
     FROM virtual_cards WHERE id = $1 AND user_id = $2`,
    [cardId, req.user.id]
  );

  if (result.rows.length === 0) throw new AppError('Card not found', 404);

  const c = result.rows[0];
  const card = {
    ...c,
    last_four: c.card_last_four,
    card_status: c.status,
    card_number: c.card_number_encrypted || null,
    cvv: c.cvv_encrypted || null,
    expiry_date: c.expiry_month && c.expiry_year
      ? `${String(c.expiry_month).padStart(2, '0')}/${c.expiry_year}`
      : null,
    billing_address: c.metadata?.billing_address || null,
    currency: c.metadata?.currency || 'USD',
    card_brand: c.metadata?.card_brand || 'visa',
  };

  // Refresh live balance from Graph
  if (c.provider_card_id) {
    try {
      const live = await graph.getCard(c.provider_card_id);
      if (live?.details?.balance !== undefined) {
        card.balance = live.details.balance;
        await query('UPDATE virtual_cards SET balance = $1 WHERE id = $2', [live.details.balance, cardId]);
      }
    } catch (e) {
      logger.warn('[Cards] Could not refresh live balance from Graph:', e.message);
    }
  }

  res.status(200).json({ success: true, data: card });
});

// ─────────────────────────────────────────────
// GET /cards/:cardId/secure-data  (fetch live PAN+CVV from Graph)
// ─────────────────────────────────────────────
export const getCardSecureData = catchAsync(async (req, res) => {
  const { cardId } = req.params;
  const result = await query(
    `SELECT id, card_number_encrypted, cvv_encrypted, card_last_four, cardholder_name,
            expiry_month, expiry_year, provider_card_id, metadata
     FROM virtual_cards WHERE id = $1 AND user_id = $2 AND status != 'terminated'`,
    [cardId, req.user.id]
  );
  if (result.rows.length === 0) throw new AppError('Card not found', 404);

  const c = result.rows[0];

  // Try to get live secure data from Graph if we have a provider card id
  let securePAN = c.card_number_encrypted;
  let secureCVV = c.cvv_encrypted;
  let secureExpiry = c.expiry_month && c.expiry_year
    ? `${String(c.expiry_month).padStart(2, '0')}/${c.expiry_year}`
    : null;
  let billingAddress = c.metadata?.billing_address || null;

  if (c.provider_card_id) {
    try {
      const liveSecure = await graph.getSecureCardData(c.provider_card_id);
      if (liveSecure) {
        if (liveSecure.pan && !liveSecure.pan.includes('*')) securePAN = liveSecure.pan;
        if (liveSecure.cvv && !liveSecure.cvv.includes('*')) secureCVV = liveSecure.cvv;
        if (liveSecure.expiry) secureExpiry = liveSecure.expiry;
        if (liveSecure.billing_address) billingAddress = liveSecure.billing_address;
      }
    } catch (e) {
      logger.warn('[Cards] Graph secure-data fetch failed:', e.message);
    }
  }

  res.status(200).json({
    success: true,
    data: {
      card_id: cardId,
      cardholder_name: c.cardholder_name,
      card_number: securePAN,
      last_four: c.card_last_four,
      cvv: secureCVV,
      expiry_date: secureExpiry,
      expiry_month: c.expiry_month,
      expiry_year: c.expiry_year,
      billing_address: billingAddress,
    }
  });
});

// ─────────────────────────────────────────────
// POST /cards
// ─────────────────────────────────────────────
export const createCard = catchAsync(async (req, res) => {
  const { card_type = 'virtual', currency = 'USD', spending_limit, billing_address } = req.body;

  // In production, enforce KYC tier 2. In development, allow any tier for testing.
  if (process.env.NODE_ENV === 'production') {
    if ((req.user.kyc_tier || 0) < 2) {
      throw new AppError('KYC Tier 2 or higher required to create virtual cards', 403);
    }
  }


  const cardCount = await query(
    `SELECT COUNT(*) as count FROM virtual_cards WHERE user_id = $1 AND status != 'terminated'`,
    [req.user.id]
  );
  const maxCards = req.user.kyc_tier === 2 ? 3 : 10;
  if (parseInt(cardCount.rows[0].count) >= maxCards) {
    throw new AppError(`Maximum ${maxCards} active cards allowed for your KYC tier`, 400);
  }

  // ── Call Graph Finance ──
  const userProfile = await query('SELECT first_name, last_name FROM user_profiles WHERE user_id = $1', [req.user.id]);
  const profile = userProfile.rows[0] || {};
  const cardholderName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'JAXOPAY USER';

  const cardResult = await graph.createCard({
    customerId: req.user.id,
    type: 'VIRTUAL',
    brand: 'VISA',
    currency: currency.toUpperCase(),
    amount: spending_limit || 1000,
    billingAddress: billing_address
  });

  // Get card details from provider response
  const providerCardId = cardResult?.cardId || null;
  const providerDetails = cardResult?.details || {};
  const raw = cardResult?.raw || {};

  // Full PAN: prefer pan from provider, fall back to generating one for internal use
  const cardPAN = providerDetails.pan || raw.pan || raw.card_number || generateCardNumber();
  const cvv = providerDetails.cvv || raw.cvv || generateCVV();
  const expiryRaw = providerDetails.expiry || '12/27';
  const [expiryMonthRaw, expiryYearRaw] = expiryRaw.split('/');
  const expiryMonth = parseInt(expiryMonthRaw) || 12;
  const expiryYear = parseInt(expiryYearRaw) || 27;



  const dbResult = await query(
    `INSERT INTO virtual_cards
       (user_id, card_type, card_number_encrypted, cvv_encrypted, card_last_four,
        cardholder_name, status, balance, spending_limit_daily,
        expiry_month, expiry_year, provider, provider_card_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, 'active', 0, $7, $8, $9, 'graph', $10, $11)
     RETURNING id, card_type, card_last_four, cardholder_name, status,
               balance, spending_limit_daily, expiry_month, expiry_year,
               provider, provider_card_id, metadata, created_at`,
    [
      req.user.id,
      card_type || 'multi_use',
      cardPAN,          // full PAN stored in card_number_encrypted
      cvv,              // CVV stored in cvv_encrypted
      cardPAN.slice(-4),
      cardholderName,
      spending_limit || 1000,
      expiryMonth,
      expiryYear,
      providerCardId,
      JSON.stringify({
        currency: currency.toUpperCase(),
        card_brand: 'visa',
        billing_address: billing_address || {},
        spending_limit: spending_limit || 1000,
        provider_response: cardResult?.raw || null,
      }),
    ]
  );

  const card = dbResult.rows[0];
  logger.info(`[Cards] Created via Graph for user ${req.user.id}: ${card.id}`);

  res.status(201).json({
    success: true,
    message: 'Virtual card created successfully',
    data: {
      ...card,
      currency: currency.toUpperCase(),
      card_brand: 'visa',
      last_four: card.card_last_four,
      card_status: 'active',
      card_number: cardPAN,
      cvv,
      expiry_date: `${String(expiryMonth).padStart(2, '0')}/${expiryYear}`,
      billing_address: billing_address || {},
      provider: 'graph',
    }
  });

});

// ─────────────────────────────────────────────
// POST /cards/:cardId/fund
// ─────────────────────────────────────────────
export const fundCard = catchAsync(async (req, res) => {
  const { cardId } = req.params;
  const { amount } = req.body;

  if (!amount || amount <= 0) throw new AppError('Amount must be greater than 0', 400);

  const result = await transaction(async (client) => {
    const card = await client.query(
      `SELECT id, user_id, balance, status, spending_limit_daily, provider_card_id
       FROM virtual_cards WHERE id = $1 FOR UPDATE`,
      [cardId]
    );

    if (card.rows.length === 0) throw new AppError('Card not found', 404);
    if (card.rows[0].user_id !== req.user.id) throw new AppError('Unauthorized', 403);
    if (card.rows[0].status !== 'active') throw new AppError('Card is not active', 400);

    const newBalance = parseFloat(card.rows[0].balance) + parseFloat(amount);
    const spendingLimit = parseFloat(card.rows[0].spending_limit_daily) || 10000;
    if (newBalance > spendingLimit) throw new AppError('Funding would exceed card spending limit', 400);

    const wallet = await client.query(
      `SELECT id, balance FROM wallets WHERE user_id = $1 AND currency = 'USD' FOR UPDATE`,
      [req.user.id]
    );

    if (wallet.rows.length === 0) throw new AppError('No USD wallet found. Create one first.', 404);
    if (parseFloat(wallet.rows[0].balance) < amount) throw new AppError('Insufficient USD wallet balance', 400);

    // Deduct from wallet
    await client.query('UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2', [amount, wallet.rows[0].id]);

    // If live provider card exists, call Graph to fund it
    if (card.rows[0].provider_card_id) {
      try { await graph.fundCard(card.rows[0].provider_card_id, amount); } catch (e) {
        logger.warn('[Cards] Graph fund call failed, internal balance applied:', e.message);
      }
    }

    // Credit card balance in DB
    await client.query('UPDATE virtual_cards SET balance = balance + $1, updated_at = NOW() WHERE id = $2', [amount, cardId]);

    // Record transaction using actual schema columns
    await client.query(
      `INSERT INTO transactions
         (user_id, from_wallet_id, transaction_type, from_amount, from_currency, net_amount, fee_amount, status, description, reference)
       VALUES ($1, $2, 'card_funding', $3, 'USD', $3, 0, 'completed', 'Virtual card funding', $4)`,
      [req.user.id, wallet.rows[0].id, amount, `CARD-FUND-${Date.now()}`]
    );

    return { newBalance };
  });

  res.status(200).json({
    success: true,
    message: 'Card funded successfully',
    data: { new_balance: result.newBalance }
  });
});

// ─────────────────────────────────────────────
// PATCH /cards/:cardId/freeze
// ─────────────────────────────────────────────
export const freezeCard = catchAsync(async (req, res) => {
  const { cardId } = req.params;
  const card = await query('SELECT id, provider_card_id FROM virtual_cards WHERE id = $1 AND user_id = $2 AND status = \'active\'', [cardId, req.user.id]);
  if (card.rows.length === 0) throw new AppError('Card not found or already frozen', 404);

  if (card.rows[0].provider_card_id) {
    try { await graph.freezeCard(card.rows[0].provider_card_id); } catch (e) { logger.warn('[Cards] Graph freeze failed:', e.message); }
  }

  const result = await query(
    `UPDATE virtual_cards SET status = 'frozen', frozen_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2 RETURNING id, status`,
    [cardId, req.user.id]
  );

  res.status(200).json({ success: true, message: 'Card frozen', data: { ...result.rows[0], card_status: 'frozen' } });
});

// ─────────────────────────────────────────────
// PATCH /cards/:cardId/unfreeze
// ─────────────────────────────────────────────
export const unfreezeCard = catchAsync(async (req, res) => {
  const { cardId } = req.params;
  const result = await query(
    `UPDATE virtual_cards SET status = 'active', frozen_at = NULL, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'frozen' RETURNING id, status`,
    [cardId, req.user.id]
  );

  if (result.rows.length === 0) throw new AppError('Card not found or not frozen', 404);
  res.status(200).json({ success: true, message: 'Card unfrozen', data: { ...result.rows[0], card_status: 'active' } });
});

// ─────────────────────────────────────────────
// DELETE /cards/:cardId  (terminate)
// ─────────────────────────────────────────────
export const terminateCard = catchAsync(async (req, res) => {
  const result = await transaction(async (client) => {
    const card = await client.query(
      'SELECT id, user_id, balance, status, provider_card_id FROM virtual_cards WHERE id = $1 FOR UPDATE',
      [req.params.cardId]
    );
    if (card.rows.length === 0) throw new AppError('Card not found', 404);
    if (card.rows[0].user_id !== req.user.id) throw new AppError('Unauthorized', 403);
    if (card.rows[0].status === 'terminated') throw new AppError('Card already terminated', 400);

    // Refund remaining balance to USD wallet
    if (parseFloat(card.rows[0].balance) > 0) {
      const wallet = await client.query('SELECT id FROM wallets WHERE user_id = $1 AND currency = \'USD\'', [req.user.id]);
      if (wallet.rows.length > 0) {
        await client.query('UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2', [card.rows[0].balance, wallet.rows[0].id]);
      }
    }

    await client.query(
      'UPDATE virtual_cards SET status = \'terminated\', terminated_at = NOW(), balance = 0, updated_at = NOW() WHERE id = $1',
      [req.params.cardId]
    );

    return { refunded: card.rows[0].balance };
  });

  res.status(200).json({ success: true, message: 'Card terminated and balance refunded', data: { refunded_amount: result.refunded } });
});

// ─────────────────────────────────────────────
// GET /cards/:cardId/transactions
// ─────────────────────────────────────────────
export const getCardTransactions = catchAsync(async (req, res) => {
  const { cardId } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  const cardCheck = await query('SELECT id FROM virtual_cards WHERE id = $1 AND user_id = $2', [cardId, req.user.id]);
  if (cardCheck.rows.length === 0) throw new AppError('Card not found', 404);

  const result = await query(
    `SELECT id, transaction_type, amount, currency, merchant_name, merchant_category, status, created_at
     FROM card_transactions WHERE card_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [cardId, limit, offset]
  );

  const countResult = await query('SELECT COUNT(*) as total FROM card_transactions WHERE card_id = $1', [cardId]);

  res.status(200).json({
    success: true,
    data: {
      transactions: result.rows,
      pagination: {
        page: parseInt(page), limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    }
  });
});

// ─────────────────────────────────────────────
// PATCH /cards/:cardId/spending-limit
// ─────────────────────────────────────────────
export const updateSpendingLimit = catchAsync(async (req, res) => {
  const { spending_limit } = req.body;
  if (!spending_limit || spending_limit <= 0) throw new AppError('Spending limit must be greater than 0', 400);

  const result = await query(
    `UPDATE virtual_cards SET spending_limit_daily = $1, updated_at = NOW()
     WHERE id = $2 AND user_id = $3 AND status != 'terminated'
     RETURNING id, spending_limit_daily as spending_limit`,
    [spending_limit, req.params.cardId, req.user.id]
  );

  if (result.rows.length === 0) throw new AppError('Card not found', 404);
  res.status(200).json({ success: true, message: 'Spending limit updated', data: result.rows[0] });
});

// ── Helpers ────────────────────────────────────
function generateCardNumber() {
  return '4111' + Math.random().toString().slice(2, 14).padEnd(12, '0').slice(0, 12);
}
function generateCVV() {
  return (Math.floor(100 + Math.random() * 900)).toString();
}
