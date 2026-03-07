import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import ReloadlyAdapter from '../orchestration/adapters/digital/ReloadlyAdapter.js';
import fxService from '../orchestration/adapters/fx/GraphFinanceService.js';

const reloadly = new ReloadlyAdapter();

// ──────────────────────────────────────────────────────────────────────
// GET /gift-cards/countries
// Returns countries where Reloadly gift cards are available
// ──────────────────────────────────────────────────────────────────────
export const getGiftCardCountries = catchAsync(async (req, res) => {
  try {
    const countries = await reloadly.getCountries();
    res.status(200).json({ success: true, data: countries });
  } catch (err) {
    logger.error('[GiftCards] getCountries failed:', err.message);
    throw new AppError(err.message || 'Could not load countries', 502);
  }
});

// ──────────────────────────────────────────────────────────────────────
// GET /gift-cards/categories
// Returns curated categories (local + Reloadly product names grouped)
// ──────────────────────────────────────────────────────────────────────
export const getGiftCardCategories = catchAsync(async (req, res) => {
  const categories = [
    { id: 'retail', name: 'Retail & Shopping', icon: '🛍️' },
    { id: 'entertainment', name: 'Entertainment', icon: '🎬' },
    { id: 'gaming', name: 'Gaming', icon: '🎮' },
    { id: 'food', name: 'Food & Dining', icon: '🍔' },
    { id: 'travel', name: 'Travel', icon: '✈️' },
    { id: 'technology', name: 'Technology', icon: '💻' },
    { id: 'fashion', name: 'Fashion', icon: '👗' },
    { id: 'music', name: 'Music & Streaming', icon: '🎵' },
    { id: 'finance', name: 'Finance & Crypto', icon: '💰' },
    { id: 'health', name: 'Health & Wellness', icon: '🏥' },
    { id: 'other', name: 'Other', icon: '🎁' },
  ];
  res.status(200).json({ success: true, data: categories });
});

// ──────────────────────────────────────────────────────────────────────
// GET /gift-cards
// Fetches real gift card products from Reloadly API
// Query: ?country=US&page=1&size=20&search=Amazon
// ──────────────────────────────────────────────────────────────────────
export const getGiftCards = catchAsync(async (req, res) => {
  const { country, page = 1, size = 20, search } = req.query;

  try {
    const params = { page: parseInt(page), size: parseInt(size) };
    if (country) params.countryCode = country;
    if (search) params.productName = search;

    const result = await reloadly.getProducts(params);

    // Reloadly returns either an array or { content: [...], totalPages, ... }
    const products = Array.isArray(result) ? result : (result?.content || []);
    const totalPages = result?.totalPages || 1;
    const totalElements = result?.totalElements || products.length;

    // Normalize to a consistent shape for the frontend
    const normalized = products.map(p => ({
      id: p.productId,
      productId: p.productId,
      brand: p.brand?.brandName || p.productName,
      productName: p.productName,
      country: p.country?.isoName || country,
      countryCode: p.country?.isoName || country,
      currency: p.recipientCurrencyCode || p.senderCurrencyCode,
      senderCurrency: p.senderCurrencyCode,
      denominationType: p.denominationType,
      minAmount: p.minRecipientDenomination,
      maxAmount: p.maxRecipientDenomination,
      fixedDenominations: p.fixedRecipientDenominations || [],
      senderMinAmount: p.minSenderDenomination,
      senderMaxAmount: p.maxSenderDenomination,
      fixedSenderDenominations: p.fixedSenderDenominations || [],
      discount: p.discountPercentage || 0,
      image_url: p.logoUrls?.[0] || p.brand?.brandName ? `https://cdn.reloadly.com/giftcards/${p.productId}.png` : null,
      redeemInstructions: p.redeemInstruction?.verbose || '',
    }));

    res.status(200).json({
      success: true,
      data: {
        gift_cards: normalized,
        pagination: {
          page: parseInt(page),
          size: parseInt(size),
          total: totalElements,
          pages: totalPages,
        },
      },
      source: 'reloadly',
    });
  } catch (err) {
    logger.error('[GiftCards] getProducts failed:', err.message);
    throw new AppError(err.message || 'Could not load gift cards', 502);
  }
});

// ──────────────────────────────────────────────────────────────────────
// GET /gift-cards/products/:productId
// Get single product details from Reloadly
// ──────────────────────────────────────────────────────────────────────
export const getGiftCardProduct = catchAsync(async (req, res) => {
  const { productId } = req.params;
  try {
    const product = await reloadly.getProduct(productId);
    res.status(200).json({ success: true, data: product });
  } catch (err) {
    logger.error(`[GiftCards] getProduct(${productId}) failed:`, err.message);
    throw new AppError(err.message || 'Product not found', 502);
  }
});

// ──────────────────────────────────────────────────────────────────────
// GET /gift-cards/discounts
// Get reseller discounts from Reloadly
// ──────────────────────────────────────────────────────────────────────
export const getGiftCardDiscounts = catchAsync(async (req, res) => {
  const { productId } = req.query;
  try {
    const discounts = await reloadly.getDiscounts(productId || null);
    res.status(200).json({ success: true, data: discounts });
  } catch (err) {
    logger.error('[GiftCards] getDiscounts failed:', err.message);
    throw new AppError(err.message || 'Could not load discounts', 502);
  }
});

// ──────────────────────────────────────────────────────────────────────
// POST /gift-cards/buy
// Purchase a gift card via Reloadly, deducting from user's wallet
// Body: { productId, countryCode, amount, quantity, currency, recipientEmail }
// ──────────────────────────────────────────────────────────────────────
export const buyGiftCard = catchAsync(async (req, res) => {
  const {
    productId,
    countryCode,
    amount,
    quantity = 1,
    currency = 'USD',
    cardCurrency = 'USD',
    recipientEmail,
  } = req.body;

  if (!productId || !amount) {
    throw new AppError('productId and amount are required', 400);
  }

  const reference = `JAXO-GC-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const totalCostInCardCurrency = parseFloat(amount) * parseInt(quantity);
  let totalCostInWalletCurrency = totalCostInCardCurrency;
  let exchangeRate = 1.0;

  // 0. Handle Currency Conversion if needed
  if (cardCurrency.toUpperCase() !== currency.toUpperCase()) {
    logger.info(`[GiftCards] FX required: ${cardCurrency} -> ${currency}`);
    const rateData = await fxService.getExchangeRate(cardCurrency, currency);
    exchangeRate = rateData.rate;
    totalCostInWalletCurrency = totalCostInCardCurrency * exchangeRate;
    logger.info(`[GiftCards] Converted: ${totalCostInCardCurrency} ${cardCurrency} = ${totalCostInWalletCurrency} ${currency} (rate: ${exchangeRate})`);
  }

  // 1. Deduct wallet balance
  const deductResult = await transaction(async (client) => {
    const wallet = await client.query(
      `SELECT id, balance FROM wallets
       WHERE user_id = $1 AND currency = $2 AND is_active = true
       FOR UPDATE`,
      [req.user.id, currency.toUpperCase()]
    );

    if (wallet.rows.length === 0) {
      throw new AppError(`No ${currency} wallet found. Please create one first.`, 404);
    }

    if (parseFloat(wallet.rows[0].balance) < totalCostInWalletCurrency) {
      throw new AppError(
        `Insufficient balance. You need ${currency} ${totalCostInWalletCurrency.toLocaleString()} but have ${currency} ${parseFloat(wallet.rows[0].balance).toLocaleString()}.`,
        400
      );
    }

    // Deduct
    await client.query(
      'UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2',
      [totalCostInWalletCurrency, wallet.rows[0].id]
    );

    // Create pending digital_transaction
    await client.query(
      `INSERT INTO digital_transactions
         (user_id, wallet_id, provider, type, product_id, country_code,
          amount, currency, quantity, recipient_email, transaction_ref, status)
       VALUES ($1, $2, 'reloadly', 'giftcard', $3, $4, $5, $6, $7, $8, $9, 'pending')`,
      [
        req.user.id, wallet.rows[0].id, String(productId), countryCode || '',
        totalCostInWalletCurrency, currency.toUpperCase(), quantity,
        recipientEmail || req.user.email, reference,
      ]
    );

    // Create transaction record
    await client.query(
      `INSERT INTO transactions
         (user_id, from_wallet_id, transaction_type, from_amount, from_currency,
          net_amount, fee_amount, status, description, reference)
       VALUES ($1, $2, 'gift_card_purchase', $3, $4, $3, 0, 'pending', $5, $6)`,
      [
        req.user.id, wallet.rows[0].id, totalCostInWalletCurrency, currency.toUpperCase(),
        `Gift card purchase: ${amount} ${cardCurrency} (Reloadly)`, reference,
      ]
    );

    return { walletId: wallet.rows[0].id };
  });

  // 2. Call Reloadly to purchase
  try {
    logger.info(`[GiftCards] Purchasing: product=${productId}, amount=${amount}, qty=${quantity}, ref=${reference}`);

    const reloadlyResult = await reloadly.purchaseGiftCard({
      productId: parseInt(productId),
      countryCode: countryCode || 'US',
      quantity: parseInt(quantity),
      unitPrice: parseFloat(amount),
      recipientEmail: recipientEmail || req.user.email,
      senderName: 'JAXOPAY',
      customIdentifier: reference,
    });

    const providerTxnId = reloadlyResult?.transactionId || reloadlyResult?.transactionCreatedDate || null;

    // Update digital_transaction to success
    await query(
      `UPDATE digital_transactions
       SET status = 'completed', provider_txn_id = $1, product_name = $2, brand_name = $3, metadata = $4, updated_at = NOW()
       WHERE transaction_ref = $5`,
      [
        String(providerTxnId || ''),
        reloadlyResult?.product?.productName || '',
        reloadlyResult?.product?.brand?.brandName || '',
        JSON.stringify(reloadlyResult),
        reference,
      ]
    );

    // Update transaction status
    await query(
      `UPDATE transactions SET status = 'completed', updated_at = NOW() WHERE reference = $1`,
      [reference]
    );

    logger.info(`[GiftCards] ✅ Purchase successful: ref=${reference}, txnId=${providerTxnId}`);

    res.status(201).json({
      success: true,
      message: 'Gift card purchased successfully!',
      data: {
        reference,
        providerTxnId,
        productId,
        amount: totalCost,
        currency: currency.toUpperCase(),
        quantity,
        status: 'completed',
      },
    });

  } catch (purchaseErr) {
    // Reloadly purchase failed — refund wallet
    logger.error('[GiftCards] Reloadly purchase failed, refunding:', purchaseErr.message);

    await query(
      'UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2',
      [totalCost, deductResult.walletId]
    );
    await query(
      `UPDATE digital_transactions SET status = 'failed', metadata = $1, updated_at = NOW() WHERE transaction_ref = $2`,
      [JSON.stringify({ error: purchaseErr.message }), reference]
    );
    await query(
      `UPDATE transactions SET status = 'failed', updated_at = NOW() WHERE reference = $1`,
      [reference]
    );

    throw new AppError(
      purchaseErr.message || 'Gift card purchase failed. Your wallet has been refunded.',
      502
    );
  }
});

// ──────────────────────────────────────────────────────────────────────
// GET /gift-cards/redeem/:transactionRef
// Retrieve gift card code / PIN from Reloadly
// ──────────────────────────────────────────────────────────────────────
export const redeemGiftCard = catchAsync(async (req, res) => {
  const { transactionRef } = req.params;

  // Find the digital transaction
  const dtResult = await query(
    `SELECT id, provider_txn_id, redeem_code, redeem_pin, redeem_instructions, status
     FROM digital_transactions
     WHERE transaction_ref = $1 AND user_id = $2`,
    [transactionRef, req.user.id]
  );

  if (dtResult.rows.length === 0) {
    throw new AppError('Transaction not found', 404);
  }

  const dt = dtResult.rows[0];
  if (dt.status !== 'completed') {
    throw new AppError('This transaction is not yet completed', 400);
  }

  // If we already have the code cached, return it
  if (dt.redeem_code) {
    return res.status(200).json({
      success: true,
      data: {
        code: dt.redeem_code,
        pin: dt.redeem_pin || null,
        instructions: dt.redeem_instructions || '',
      },
    });
  }

  // Fetch from Reloadly
  if (!dt.provider_txn_id) {
    throw new AppError('No provider transaction ID found. Please contact support.', 400);
  }

  try {
    const redeemData = await reloadly.getRedeemCode(dt.provider_txn_id);

    // Reloadly returns an array of cards
    const cards = Array.isArray(redeemData) ? redeemData : [redeemData];
    const card = cards[0] || {};

    const code = card.cardNumber || card.pinCode || '';
    const pin = card.pinCode || '';
    const instructions = card.redemptionInstructions || '';

    // Cache in DB
    if (code) {
      await query(
        `UPDATE digital_transactions
         SET redeem_code = $1, redeem_pin = $2, redeem_instructions = $3, updated_at = NOW()
         WHERE id = $4`,
        [code, pin, instructions, dt.id]
      );
    }

    res.status(200).json({
      success: true,
      data: {
        code: code || 'Check your email for the gift card code',
        pin: pin || null,
        instructions,
      },
    });
  } catch (err) {
    logger.error('[GiftCards] Redeem fetch failed:', err.message);
    throw new AppError(err.message || 'Could not retrieve gift card code', 502);
  }
});

// ──────────────────────────────────────────────────────────────────────
// GET /gift-cards/my-cards
// Returns user's purchased digital gift cards from digital_transactions
// ──────────────────────────────────────────────────────────────────────
export const getMyGiftCards = catchAsync(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let conditions = 'WHERE user_id = $1 AND type = $2';
  const params = [req.user.id, 'giftcard'];

  if (status) {
    params.push(status);
    conditions += ` AND status = $${params.length}`;
  }

  const result = await query(
    `SELECT id, provider, product_id, product_name, brand_name, country_code,
            amount, currency, quantity, recipient_email, transaction_ref,
            provider_txn_id, status, redeem_code, created_at
     FROM digital_transactions
     ${conditions}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, parseInt(limit), offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) as total FROM digital_transactions ${conditions}`,
    params
  );

  res.status(200).json({
    success: true,
    data: {
      gift_cards: result.rows.map(r => ({
        ...r,
        has_code: !!r.redeem_code,
        redeem_code: undefined, // Don't expose in list view
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / parseInt(limit)),
      },
    },
  });
});

// ──────────────────────────────────────────────────────────────────────
// GET /gift-cards/balance
// Returns Reloadly wallet balance (admin/monitoring)
// ──────────────────────────────────────────────────────────────────────
export const getReloadlyBalance = catchAsync(async (req, res) => {
  try {
    const balance = await reloadly.getBalance();
    res.status(200).json({ success: true, data: balance });
  } catch (err) {
    logger.error('[GiftCards] getBalance failed:', err.message);
    throw new AppError(err.message || 'Could not fetch provider balance', 502);
  }
});

// ──────────────────────────────────────────────────────────────────────
// Backward compatibility: sellGiftCard (keep as stub)
// ──────────────────────────────────────────────────────────────────────
export const sellGiftCard = catchAsync(async (req, res) => {
  throw new AppError('Gift card selling is not yet available', 501);
});
