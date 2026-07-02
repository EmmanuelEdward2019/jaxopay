import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import emailService from '../services/email.service.js';
import GraphAdapter from '../orchestration/adapters/cards/GraphAdapter.js';
import StrowalletAdapter from '../orchestration/adapters/cards/StrowalletAdapter.js';
import { verifyTransactionPin } from '../services/transactionPin.service.js';
import { getCardFee, getFeeConfig } from '../services/feeConfig.service.js';
import { auditFromReq } from '../services/audit.service.js';
const graph = new GraphAdapter();
const strowallet = new StrowalletAdapter();

/** Strowallet blocks unknown outbound IPs — map to actionable text; log raw for ops. */
function userFacingStrowalletError(rawMessage) {
  const s = String(rawMessage || '');
  if (/untrusted source ip|untrusted\s+source|ip\s+not\s+allowed|ip\s+whitelist|allowlist|not\s+in\s+the\s+allowed/i.test(s)) {
    return (
      'The card service is temporarily unavailable due to a server configuration issue on our end. ' +
      'Please try again shortly or contact support if the problem persists.'
    );
  }
  return s;
}

function strowalletCardsEnabled() {
  return !!(process.env.STROWALLET_PUBLIC_KEY && process.env.STROWALLET_SECRET_KEY);
}

/** Legacy Graph path — opt-in only when Strowallet is not configured */
function graphCardsFallbackEnabled() {
  return (
    process.env.GRAPH_CARDS_ENABLED === 'true' &&
    !!process.env.GRAPH_API_KEY &&
    !String(process.env.GRAPH_API_KEY).includes('your_')
  );
}

const COUNTRY_ISO3 = {
  NG: 'NGA', NGA: 'NGA', NIGERIA: 'NGA', GH: 'GHA', GHA: 'GHA', GHANA: 'GHA',
  KE: 'KEN', KEN: 'KEN', KENYA: 'KEN', ZA: 'ZAF', ZAF: 'ZAF', US: 'USA', USA: 'USA',
  GB: 'GBR', GBR: 'GBR', UK: 'GBR', CA: 'CAN', CAN: 'CAN', HT: 'HTI', HTI: 'HTI',
};
function toIso3(c) {
  if (!c) return '';
  const k = String(c).trim().toUpperCase();
  if (COUNTRY_ISO3[k]) return COUNTRY_ISO3[k];
  return k.length === 3 ? k : '';
}
function mapIdType(t) {
  const s = String(t || '').toLowerCase();
  if (s.includes('passport')) return 'passport';
  if (s.includes('driver') || s.includes('licence') || s.includes('license')) return 'drivers_license';
  return 'national_id';
}
function formatDobMMDDYYYY(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${dt.getFullYear()}`;
}

/**
 * Build (and validate) the cardholder KYC payload required by create-nfc-card.
 * Throws a clear AppError listing what the user still needs to provide.
 */
async function gatherCardholderKyc(userId) {
  const prof = (await query(
    `SELECT first_name, last_name, date_of_birth, address_line1, city, state, postal_code, country
     FROM user_profiles WHERE user_id = $1`,
    [userId]
  )).rows[0] || {};
  const kycDoc = (await query(
    `SELECT document_type, document_number FROM kyc_documents
     WHERE user_id = $1 AND document_number IS NOT NULL
     ORDER BY reviewed_at DESC NULLS LAST, created_at DESC LIMIT 1`,
    [userId]
  )).rows[0] || {};
  const userRow = (await query('SELECT email, phone FROM users WHERE id = $1', [userId])).rows[0] || {};

  const kyc = {
    firstName: prof.first_name || '',
    lastName: prof.last_name || '',
    name: `${prof.first_name || ''} ${prof.last_name || ''}`.trim(),
    dob: formatDobMMDDYYYY(prof.date_of_birth),
    idType: mapIdType(kycDoc.document_type),
    idNumber: kycDoc.document_number || '',
    email: userRow.email || '',
    phone: userRow.phone || '',
    line1: prof.address_line1 || '',
    city: prof.city || '',
    state: prof.state || '',
    postalCode: prof.postal_code || '',
    country: toIso3(prof.country),
  };

  const missing = [];
  if (!kyc.firstName || !kyc.lastName) missing.push('your full name');
  if (!kyc.dob) missing.push('date of birth');
  if (!kyc.idNumber) missing.push('a verified government ID (complete KYC)');
  if (!kyc.line1 || !kyc.city || !kyc.state || !kyc.country) missing.push('your billing address');
  if (!kyc.phone) missing.push('a phone number');
  if (!kyc.email) missing.push('an email address');
  if (missing.length) {
    throw new AppError(
      `Please complete your profile and KYC before creating a card. We still need: ${missing.join(', ')}.`,
      400,
      'CARD_KYC_INCOMPLETE'
    );
  }
  return kyc;
}

// ─────────────────────────────────────────────
// GET /cards/fees  — current card creation/funding fees (for the UI breakdown)
// ─────────────────────────────────────────────
export const getCardFees = catchAsync(async (req, res) => {
  const [creation, funding] = await Promise.all([
    getFeeConfig('card_creation', 'USD'),
    getFeeConfig('card_funding', 'USD'),
  ]);
  const shape = (c) => ({
    fee_type: c?.fee_type || 'flat_plus_percent',
    flat: Number(c?.min_fee) || 0,       // flat component for flat_plus_percent
    percent: Number(c?.fee_value) || 0,  // percentage component
    cap: Number(c?.max_fee) || 0,
  });
  res.status(200).json({
    success: true,
    data: { card_creation: shape(creation), card_funding: shape(funding) },
  });
});

// ─────────────────────────────────────────────
// GET /cards
// ─────────────────────────────────────────────
export const getCards = catchAsync(async (req, res) => {
  const result = await query(
    `SELECT id, card_type, card_number_encrypted, cvv_encrypted, card_last_four, cardholder_name,
            status, balance, spending_limit_daily, spending_limit_monthly,
            expiry_month, expiry_year, provider, provider_card_id, metadata, created_at
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
            expiry_month, expiry_year, provider, provider_card_id, metadata, created_at
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

  // Refresh live balance from primary provider
  if (c.provider_card_id) {
    try {
      if (c.provider === 'strowallet') {
        const live = await strowallet.getNfcCardDetail(c.provider_card_id);
        const bal = live?.balance ?? live?.card_balance ?? live?.available_balance;
        if (bal !== undefined && bal !== null) {
          card.balance = parseFloat(bal);
          await query('UPDATE virtual_cards SET balance = $1 WHERE id = $2', [parseFloat(bal), cardId]);
        }
      } else {
        const live = await graph.getCard(c.provider_card_id);
        if (live?.details?.balance !== undefined) {
          card.balance = live.details.balance;
          await query('UPDATE virtual_cards SET balance = $1 WHERE id = $2', [live.details.balance, cardId]);
        }
      }
    } catch (e) {
      logger.warn('[Cards] Could not refresh live balance from provider:', e.message);
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
            expiry_month, expiry_year, provider, provider_card_id, metadata
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
      const liveSecure =
        c.provider === 'strowallet'
          ? await strowallet.getSecureNfcCardData(c.provider_card_id)
          : await graph.getSecureCardData(c.provider_card_id);
      if (liveSecure) {
        if (liveSecure.pan && !liveSecure.pan.includes('*')) securePAN = liveSecure.pan;
        if (liveSecure.cvv && !liveSecure.cvv.includes('*')) secureCVV = liveSecure.cvv;
        if (liveSecure.expiry) secureExpiry = liveSecure.expiry;
        if (liveSecure.billing_address) billingAddress = liveSecure.billing_address;
      }
    } catch (e) {
      logger.warn('[Cards] Provider secure-data fetch failed:', e.message);
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
  const { card_type = 'multi_use', spending_limit } = req.body;
  const amountUsd = Number(req.body.amount_usd ?? req.body.initial_amount ?? 0);

  if (process.env.NODE_ENV === 'production' && (req.user.kyc_tier || 0) < 2) {
    throw new AppError('KYC Tier 2 or higher required to create virtual cards', 403);
  }
  if (!Number.isFinite(amountUsd) || amountUsd < 1) {
    throw new AppError('An initial funding amount of at least $1 is required', 400);
  }

  // Require the transaction PIN — creating a card debits the USD wallet.
  await verifyTransactionPin(req.user.id, req.body.pin);

  if (!strowalletCardsEnabled()) {
    throw new AppError('Virtual cards are not available right now. Please try again later or contact support.', 503);
  }

  const cardCount = await query(
    `SELECT COUNT(*) as count FROM virtual_cards WHERE user_id = $1 AND status != 'terminated'`,
    [req.user.id]
  );
  const maxCards = req.user.kyc_tier === 2 ? 3 : 10;
  if (parseInt(cardCount.rows[0].count) >= maxCards) {
    throw new AppError(`Maximum ${maxCards} active cards allowed for your KYC tier`, 400);
  }

  // Gather the cardholder KYC required by Strowallet's create-nfc-card endpoint.
  const kyc = await gatherCardholderKyc(req.user.id);

  // Card creation fee (editable in admin Rates & Fees). User pays amount + fee.
  const { fee: creationFee } = await getCardFee('card_creation', amountUsd);
  const totalDebit = Math.round((amountUsd + creationFee + Number.EPSILON) * 100) / 100;

  // Atomic: lock + debit USD wallet, call provider, persist the card.
  const created = await transaction(async (client) => {
    const wallet = await client.query(
      `SELECT id, balance FROM wallets WHERE user_id = $1 AND currency = 'USD' AND is_active = true FOR UPDATE`,
      [req.user.id]
    );
    if (wallet.rows.length === 0) throw new AppError('You need a USD wallet to create a card. Create one first.', 404);
    if (parseFloat(wallet.rows[0].balance) < totalDebit) {
      throw new AppError(`Insufficient USD balance. You need $${totalDebit.toFixed(2)} ($${amountUsd.toFixed(2)} + $${creationFee.toFixed(2)} fee).`, 400);
    }

    let cardResult;
    try {
      cardResult = await strowallet.createNfcCard({ ...kyc, amountUsd });
    } catch (swErr) {
      const rawMsg = swErr?.message || 'Virtual card creation failed';
      logger.error('[Cards] Strowallet NFC create failed:', { message: rawMsg, raw: swErr?.raw, statusCode: swErr?.statusCode });
      const friendly = userFacingStrowalletError(rawMsg);
      throw new AppError(
        friendly !== rawMsg ? `We could not create your card: ${friendly}` : `We could not create your card: ${rawMsg}.`,
        swErr?.statusCode && swErr.statusCode >= 400 && swErr.statusCode < 600 ? swErr.statusCode : 502
      );
    }

    // Charge the user (initial funding + creation fee) only after the provider accepted the card.
    await client.query('UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2', [totalDebit, wallet.rows[0].id]);

    const providerCardId = cardResult?.cardId || null;
    const d = cardResult?.details || {};
    const raw = cardResult?.raw || {};
    const cardPAN = d.pan || raw.card_number || raw.pan || generateCardNumber();
    const cvv = d.cvv || raw.cvv || generateCVV();
    const expiryRaw = d.expiry || '12/29';
    const [em, ey] = String(expiryRaw).split('/');
    const expiryMonth = parseInt(em) || 12;
    const expiryYear = parseInt(ey) || ((new Date().getFullYear() + 4) % 100);

    const dbResult = await client.query(
      `INSERT INTO virtual_cards
         (user_id, card_type, card_number_encrypted, cvv_encrypted, card_last_four,
          cardholder_name, status, balance, spending_limit_daily,
          expiry_month, expiry_year, provider, provider_card_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, $10, 'strowallet', $11, $12)
       RETURNING id, card_type, card_last_four, cardholder_name, status,
                 balance, spending_limit_daily, expiry_month, expiry_year,
                 provider, provider_card_id, metadata, created_at`,
      [
        req.user.id,
        card_type || 'multi_use',
        cardPAN,
        cvv,
        String(cardPAN).slice(-4),
        kyc.name || 'JAXOPAY USER',
        amountUsd,
        spending_limit || amountUsd,
        expiryMonth,
        expiryYear,
        providerCardId,
        JSON.stringify({
          currency: 'USD',
          card_brand: 'visa',
          billing_address: { line1: kyc.line1, city: kyc.city, state: kyc.state, postal_code: kyc.postalCode, country: kyc.country },
          spending_limit: spending_limit || amountUsd,
          provider_response: raw || null,
        }),
      ]
    );

    // Record the initial funding so it shows in card history immediately.
    await client.query(
      `INSERT INTO card_transactions (card_id, provider_reference, merchant_name, amount, currency, status, metadata)
       VALUES ($1, $2, 'Initial card funding', $3, 'USD', 'completed', $4)`,
      [dbResult.rows[0].id, `CARDFUND-${Date.now()}`, amountUsd, JSON.stringify({ type: 'funding', source: 'usd_wallet', fee: creationFee })]
    );

    return { card: dbResult.rows[0], cardPAN, cvv, expiryMonth, expiryYear };
  });

  const card = created.card;
  logger.info(`[Cards] Created NFC card via Strowallet for user ${req.user.id}: ${card.id}`);
  auditFromReq(req, { action: 'card_created', entityType: 'virtual_card', entityId: card.id, newValues: { amount_usd: amountUsd, card_type } });

  res.status(201).json({
    success: true,
    message: 'Virtual card created successfully',
    data: {
      ...card,
      fee: creationFee,
      total_charged: totalDebit,
      currency: 'USD',
      card_brand: 'visa',
      last_four: card.card_last_four,
      card_status: 'active',
      card_number: created.cardPAN,
      cvv: created.cvv,
      expiry_date: `${String(created.expiryMonth).padStart(2, '0')}/${created.expiryYear}`,
      billing_address: card.metadata?.billing_address || {},
      provider: 'strowallet',
    },
  });
});

// ─────────────────────────────────────────────
// POST /cards/:cardId/fund
// ─────────────────────────────────────────────
export const fundCard = catchAsync(async (req, res) => {
  const { cardId } = req.params;
  const { amount } = req.body;

  if (!amount || amount <= 0) throw new AppError('Amount must be greater than 0', 400);

  // Require the transaction PIN — funding moves money out of the USD wallet.
  await verifyTransactionPin(req.user.id, req.body.pin);

  // Card funding fee (editable in admin Rates & Fees). User pays amount + fee.
  const { fee: fundingFee } = await getCardFee('card_funding', amount);
  const totalDebit = Math.round((parseFloat(amount) + fundingFee + Number.EPSILON) * 100) / 100;

  const result = await transaction(async (client) => {
    const card = await client.query(
      `SELECT id, user_id, balance, status, spending_limit_daily, provider, provider_card_id
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
    if (parseFloat(wallet.rows[0].balance) < totalDebit) {
      throw new AppError(`Insufficient USD balance. You need $${totalDebit.toFixed(2)} ($${parseFloat(amount).toFixed(2)} + $${fundingFee.toFixed(2)} fee).`, 400);
    }

    // Deduct amount + fee from wallet (only `amount` is loaded onto the card)
    await client.query('UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2', [totalDebit, wallet.rows[0].id]);

    // If live provider card exists, fund at provider
    if (card.rows[0].provider_card_id) {
      try {
        if (card.rows[0].provider === 'strowallet') {
          await strowallet.fundWithdrawNfc(card.rows[0].provider_card_id, amount, 'fund');
        } else {
          await graph.fundCard(card.rows[0].provider_card_id, amount);
        }
      } catch (e) {
        logger.warn('[Cards] Provider fund call failed, internal balance applied:', e.message);
      }
    }

    // Credit card balance in DB
    await client.query('UPDATE virtual_cards SET balance = balance + $1, updated_at = NOW() WHERE id = $2', [amount, cardId]);

    const reference = `CARD-FUND-${Date.now()}`;

    // Record in the user's main transaction ledger
    await client.query(
      `INSERT INTO transactions
         (user_id, from_wallet_id, transaction_type, from_amount, from_currency, net_amount, fee_amount, status, description, reference)
       VALUES ($1, $2, 'card_funding', $3, 'USD', $3, $4, 'completed', 'Virtual card funding', $5)`,
      [req.user.id, wallet.rows[0].id, amount, fundingFee, reference]
    );

    // Record in the card's own history so it shows immediately under this card.
    await client.query(
      `INSERT INTO card_transactions (card_id, provider_reference, merchant_name, amount, currency, status, metadata)
       VALUES ($1, $2, 'Card funding', $3, 'USD', 'completed', $4)`,
      [cardId, reference, amount, JSON.stringify({ type: 'funding', source: 'usd_wallet', fee: fundingFee })]
    );

    return { newBalance, fee: fundingFee, totalDebit };
  });

  auditFromReq(req, { action: 'card_funded', entityType: 'virtual_card', entityId: cardId, newValues: { amount, fee: result.fee, total_charged: result.totalDebit } });

  res.status(200).json({
    success: true,
    message: 'Card funded successfully',
    data: { new_balance: result.newBalance, fee: result.fee, total_charged: result.totalDebit }
  });
});

// ─────────────────────────────────────────────
// PATCH /cards/:cardId/freeze
// ─────────────────────────────────────────────
export const freezeCard = catchAsync(async (req, res) => {
  const { cardId } = req.params;
  const card = await query(
    'SELECT id, provider, provider_card_id FROM virtual_cards WHERE id = $1 AND user_id = $2 AND status = \'active\'',
    [cardId, req.user.id]
  );
  if (card.rows.length === 0) throw new AppError('Card not found or already frozen', 404);

  if (card.rows[0].provider_card_id) {
    try {
      if (card.rows[0].provider === 'strowallet') {
        await strowallet.freezeNfcCard(card.rows[0].provider_card_id, true);
      } else {
        await graph.freezeCard(card.rows[0].provider_card_id);
      }
    } catch (e) {
      logger.warn('[Cards] Provider freeze failed:', e.message);
    }
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
     WHERE id = $1 AND user_id = $2 AND status = 'frozen'
     RETURNING id, status, provider, provider_card_id`,
    [cardId, req.user.id]
  );

  if (result.rows.length === 0) throw new AppError('Card not found or not frozen', 404);

  const c = result.rows[0];
  if (c.provider_card_id) {
    try {
      if (c.provider === 'strowallet') await strowallet.freezeNfcCard(c.provider_card_id, false);
      else await graph.unfreezeCard(c.provider_card_id);
    } catch (e) {
      logger.warn('[Cards] Provider unfreeze/activate failed (DB state applied):', e.message);
    }
  }

  res.status(200).json({ success: true, message: 'Card unfrozen', data: { id: c.id, status: c.status, card_status: 'active' } });
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
// Normalize Strowallet's NFC transaction payload (shape varies) into our card-txn shape.
function normalizeNfcTransactions(raw) {
  let arr = [];
  if (Array.isArray(raw)) arr = raw;
  else if (Array.isArray(raw?.transactions)) arr = raw.transactions;
  else if (Array.isArray(raw?.data)) arr = raw.data;
  else if (Array.isArray(raw?.data?.transactions)) arr = raw.data.transactions;
  else if (Array.isArray(raw?.response)) arr = raw.response;
  return arr.map((t, i) => ({
    id: t.id || t.reference || t.txn_id || t.transaction_id || `nfc-${i}-${t.created_at || t.date || ''}`,
    transaction_type: t.type || t.transaction_type || t.category || 'card',
    amount: parseFloat(t.amount ?? t.amount_usd ?? t.value ?? 0) || 0,
    currency: t.currency || 'USD',
    merchant_name: t.merchant || t.merchant_name || t.narration || t.description || t.title || null,
    merchant_category: t.merchant_category || t.category || null,
    status: t.status || 'completed',
    created_at: t.created_at || t.date || t.time || t.transaction_date || new Date().toISOString(),
    source: 'provider',
  }));
}

export const getCardTransactions = catchAsync(async (req, res) => {
  const { cardId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  const cardCheck = await query(
    'SELECT id, provider, provider_card_id FROM virtual_cards WHERE id = $1 AND user_id = $2',
    [cardId, req.user.id]
  );
  if (cardCheck.rows.length === 0) throw new AppError('Card not found', 404);
  const card = cardCheck.rows[0];

  // Prefer live transactions from the provider (authoritative card spend).
  if (card.provider === 'strowallet' && card.provider_card_id) {
    try {
      const raw = await strowallet.getNfcCardTransactions(card.provider_card_id);
      const all = normalizeNfcTransactions(raw);
      if (all.length) {
        all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return res.status(200).json({
          success: true,
          data: {
            transactions: all.slice(offset, offset + limit),
            source: 'provider',
            pagination: { page, limit, total: all.length, pages: Math.ceil(all.length / limit) },
          },
        });
      }
    } catch (e) {
      logger.warn('[Cards] Live NFC transactions fetch failed, falling back to local:', e.message);
    }
  }

  // Fallback: locally recorded transactions (funding, etc.)
  const result = await query(
    `SELECT id, COALESCE(metadata->>'type', 'card') AS transaction_type,
            amount, currency, merchant_name, merchant_category, status, created_at
     FROM card_transactions WHERE card_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [cardId, limit, offset]
  );
  const countResult = await query('SELECT COUNT(*) as total FROM card_transactions WHERE card_id = $1', [cardId]);

  res.status(200).json({
    success: true,
    data: {
      transactions: result.rows,
      source: 'local',
      pagination: {
        page, limit,
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit),
      },
    },
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
