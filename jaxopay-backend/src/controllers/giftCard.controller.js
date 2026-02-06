import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

// Get available gift cards
export const getGiftCards = catchAsync(async (req, res) => {
  const { category, country, min_price, max_price, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  let conditions = 'WHERE status = $1';
  const params = ['active'];

  if (category) {
    params.push(category);
    conditions += ` AND category = $${params.length}`;
  }

  if (country) {
    params.push(country);
    conditions += ` AND country = $${params.length}`;
  }

  if (min_price) {
    params.push(parseFloat(min_price));
    conditions += ` AND price >= $${params.length}`;
  }

  if (max_price) {
    params.push(parseFloat(max_price));
    conditions += ` AND price <= $${params.length}`;
  }

  const result = await query(
    `SELECT id, brand, category, country, denomination, price, currency,
            discount_percentage, image_url, description, created_at
     FROM gift_cards
     ${conditions}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) as total FROM gift_cards ${conditions}`,
    params
  );

  res.status(200).json({
    success: true,
    data: {
      gift_cards: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit),
      },
    },
  });
});

// Buy gift card
export const buyGiftCard = catchAsync(async (req, res) => {
  const { gift_card_id, quantity, currency } = req.body;

  // Check KYC tier
  if (req.user.kyc_tier < 1) {
    throw new AppError('KYC Tier 1 or higher required to buy gift cards', 403);
  }

  const result = await transaction(async (client) => {
    // Get gift card details
    const giftCard = await client.query(
      `SELECT id, brand, denomination, price, currency, status
       FROM gift_cards
       WHERE id = $1 AND status = 'active'
       FOR UPDATE`,
      [gift_card_id]
    );

    if (giftCard.rows.length === 0) {
      throw new AppError('Gift card not found or unavailable', 404);
    }

    const totalAmount = parseFloat(giftCard.rows[0].price) * quantity;

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

    if (parseFloat(wallet.rows[0].balance) < totalAmount) {
      throw new AppError('Insufficient balance', 400);
    }

    // Deduct from wallet
    await client.query(
      'UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2',
      [totalAmount, wallet.rows[0].id]
    );

    // Create gift card purchase
    const purchase = await client.query(
      `INSERT INTO gift_card_purchases
       (user_id, gift_card_id, quantity, total_amount, currency, status)
       VALUES ($1, $2, $3, $4, $5, 'completed')
       RETURNING id, created_at`,
      [req.user.id, gift_card_id, quantity, totalAmount, currency.toUpperCase()]
    );

    // Generate gift card codes
    const codes = [];
    for (let i = 0; i < quantity; i++) {
      const code = generateGiftCardCode();
      codes.push(code);

      await client.query(
        `INSERT INTO user_gift_cards
         (user_id, purchase_id, gift_card_id, code, status)
         VALUES ($1, $2, $3, $4, 'active')`,
        [req.user.id, purchase.rows[0].id, gift_card_id, code]
      );
    }

    // Create wallet transaction
    await client.query(
      `INSERT INTO wallet_transactions
       (wallet_id, transaction_type, amount, currency, status, description, metadata)
       VALUES ($1, 'gift_card_purchase', $2, $3, 'completed', 'Gift card purchase', $4)`,
      [
        wallet.rows[0].id,
        totalAmount,
        currency.toUpperCase(),
        JSON.stringify({
          purchase_id: purchase.rows[0].id,
          gift_card_id,
          brand: giftCard.rows[0].brand,
          quantity,
        }),
      ]
    );

    return {
      purchaseId: purchase.rows[0].id,
      codes,
      totalAmount,
    };
  });

  logger.info('Gift card purchased:', {
    userId: req.user.id,
    purchaseId: result.purchaseId,
    quantity,
  });

  res.status(201).json({
    success: true,
    message: 'Gift card purchased successfully',
    data: {
      purchase_id: result.purchaseId,
      codes: result.codes,
      quantity,
      total_amount: result.totalAmount,
      currency: currency.toUpperCase(),
    },
  });
});

// Get user's gift cards
export const getMyGiftCards = catchAsync(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  let conditions = 'WHERE ugc.user_id = $1';
  const params = [req.user.id];

  if (status) {
    params.push(status);
    conditions += ` AND ugc.status = $${params.length}`;
  }

  const result = await query(
    `SELECT ugc.id, ugc.code, ugc.status, ugc.created_at,
            gc.brand, gc.category, gc.denomination, gc.currency, gc.image_url
     FROM user_gift_cards ugc
     JOIN gift_cards gc ON ugc.gift_card_id = gc.id
     ${conditions}
     ORDER BY ugc.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) as total FROM user_gift_cards ugc ${conditions}`,
    params
  );

  res.status(200).json({
    success: true,
    data: {
      gift_cards: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit),
      },
    },
  });
});

// Sell gift card
export const sellGiftCard = catchAsync(async (req, res) => {
  const { brand, category, denomination, price, currency, code, country } = req.body;

  // Check KYC tier
  if (req.user.kyc_tier < 1) {
    throw new AppError('KYC Tier 1 or higher required to sell gift cards', 403);
  }

  // Calculate discount percentage
  const discountPercentage = ((denomination - price) / denomination) * 100;

  const result = await query(
    `INSERT INTO gift_cards
     (seller_id, brand, category, country, denomination, price, currency,
      discount_percentage, status, code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending_verification', $9)
     RETURNING id, status, created_at`,
    [
      req.user.id,
      brand,
      category,
      country,
      denomination,
      price,
      currency.toUpperCase(),
      discountPercentage,
      code,
    ]
  );

  logger.info('Gift card listed for sale:', {
    userId: req.user.id,
    giftCardId: result.rows[0].id,
    brand,
  });

  res.status(201).json({
    success: true,
    message: 'Gift card submitted for verification',
    data: {
      gift_card_id: result.rows[0].id,
      status: result.rows[0].status,
    },
  });
});

// Redeem gift card
export const redeemGiftCard = catchAsync(async (req, res) => {
  const { code } = req.body;

  const result = await transaction(async (client) => {
    // Get gift card with lock
    const giftCard = await client.query(
      `SELECT id, gift_card_id, status
       FROM user_gift_cards
       WHERE user_id = $1 AND code = $2
       FOR UPDATE`,
      [req.user.id, code]
    );

    if (giftCard.rows.length === 0) {
      throw new AppError('Gift card not found', 404);
    }

    if (giftCard.rows[0].status === 'redeemed') {
      throw new AppError('Gift card already redeemed', 400);
    }

    if (giftCard.rows[0].status === 'expired') {
      throw new AppError('Gift card has expired', 400);
    }

    // Mark as redeemed
    await client.query(
      `UPDATE user_gift_cards
       SET status = 'redeemed', redeemed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [giftCard.rows[0].id]
    );

    return { giftCardId: giftCard.rows[0].id };
  });

  logger.info('Gift card redeemed:', {
    userId: req.user.id,
    giftCardId: result.giftCardId,
  });

  res.status(200).json({
    success: true,
    message: 'Gift card redeemed successfully',
  });
});

// Get gift card categories
export const getGiftCardCategories = catchAsync(async (req, res) => {
  const categories = [
    { id: 'retail', name: 'Retail', icon: '🛍️' },
    { id: 'entertainment', name: 'Entertainment', icon: '🎬' },
    { id: 'gaming', name: 'Gaming', icon: '🎮' },
    { id: 'food', name: 'Food & Dining', icon: '🍔' },
    { id: 'travel', name: 'Travel', icon: '✈️' },
    { id: 'technology', name: 'Technology', icon: '💻' },
  ];

  res.status(200).json({
    success: true,
    data: categories,
  });
});

// Generate gift card code
function generateGiftCardCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 16; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
    if ((i + 1) % 4 === 0 && i < 15) code += '-';
  }
  return code;
}

