import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import { ledgerService } from '../orchestration/index.js';
import KorapayAdapter from '../orchestration/adapters/payments/KorapayAdapter.js';
import complianceEngine from '../orchestration/compliance/ComplianceEngine.js';
import axios from 'axios';

const korapay = new KorapayAdapter();

// ─────────────────────────────────────────────
// GET /payments/corridors
// ─────────────────────────────────────────────
export const getPaymentCorridors = catchAsync(async (req, res) => {
  // Fetch live FX rate from Korapay if possible, else static
  let rates = await getLiveRates();

  const corridors = [
    { from: 'USD', to: 'NGN', rate: rates.USD_NGN, fee_percentage: 1.5, min_amount: 5, max_amount: 10000, delivery_time: '5–30 minutes', provider: 'korapay' },
    { from: 'USD', to: 'GHS', rate: rates.USD_GHS, fee_percentage: 1.5, min_amount: 5, max_amount: 10000, delivery_time: '5–30 minutes', provider: 'korapay' },
    { from: 'USD', to: 'KES', rate: rates.USD_KES, fee_percentage: 1.5, min_amount: 5, max_amount: 10000, delivery_time: '5–30 minutes', provider: 'korapay' },
    { from: 'EUR', to: 'NGN', rate: rates.EUR_NGN, fee_percentage: 1.5, min_amount: 5, max_amount: 10000, delivery_time: '5–30 minutes', provider: 'korapay' },
    { from: 'GBP', to: 'NGN', rate: rates.GBP_NGN, fee_percentage: 1.5, min_amount: 5, max_amount: 10000, delivery_time: '5–30 minutes', provider: 'korapay' },
    { from: 'NGN', to: 'USD', rate: rates.NGN_USD, fee_percentage: 1.5, min_amount: 1000, max_amount: 5000000, delivery_time: '5–30 minutes', provider: 'korapay' },
  ];

  res.status(200).json({ success: true, data: corridors });
});

// ─────────────────────────────────────────────
// GET /payments/quote?from=USD&to=NGN&amount=100
// ─────────────────────────────────────────────
export const getFXQuote = catchAsync(async (req, res) => {
  const { from, to, amount } = req.query;
  if (!from || !to || !amount) throw new AppError('from, to, and amount are required', 400);

  const rates = await getLiveRates();
  const key = `${from.toUpperCase()}_${to.toUpperCase()}`;
  const exchangeRate = rates[key];

  if (!exchangeRate) throw new AppError(`Exchange rate not available for ${from} to ${to}`, 400);

  const sourceAmount = parseFloat(amount);
  const fee = sourceAmount * 0.015;
  const destinationAmount = (sourceAmount - fee) * exchangeRate;

  res.status(200).json({
    success: true,
    data: {
      from: from.toUpperCase(), to: to.toUpperCase(),
      source_amount: sourceAmount, destination_amount: parseFloat(destinationAmount.toFixed(2)),
      exchange_rate: exchangeRate, fee: parseFloat(fee.toFixed(4)),
      total_debit: parseFloat((sourceAmount + fee).toFixed(2)),
      timestamp: new Date().toISOString(), valid_for_seconds: 300
    }
  });
});

// ─────────────────────────────────────────────
// GET /payments/beneficiaries
// ─────────────────────────────────────────────
export const getBeneficiaries = catchAsync(async (req, res) => {
  const result = await query(
    `SELECT id, name as beneficiary_name, account_number, bank_name, bank_code,
            country, currency, beneficiary_type, created_at
     FROM beneficiaries WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.status(200).json({ success: true, data: result.rows });
});

// ─────────────────────────────────────────────
// POST /payments/beneficiaries
// ─────────────────────────────────────────────
export const addBeneficiary = catchAsync(async (req, res) => {
  const { beneficiary_name, account_number, bank_name, bank_code, country, currency, beneficiary_type, metadata } = req.body;

  const result = await query(
    `INSERT INTO beneficiaries (user_id, name, account_number, bank_name, bank_code, country, currency, beneficiary_type, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, name as beneficiary_name, account_number, bank_name, country, currency, created_at`,
    [req.user.id, beneficiary_name, account_number, bank_name, bank_code || null, country, currency.toUpperCase(), beneficiary_type || 'individual', metadata ? JSON.stringify(metadata) : null]
  );

  res.status(201).json({ success: true, message: 'Beneficiary added successfully', data: result.rows[0] });
});

// ─────────────────────────────────────────────
// DELETE /payments/beneficiaries/:beneficiaryId
// ─────────────────────────────────────────────
export const deleteBeneficiary = catchAsync(async (req, res) => {
  const result = await query(
    'UPDATE beneficiaries SET is_active = false, updated_at = NOW() WHERE id = $1 AND user_id = $2 AND is_active = true RETURNING id',
    [req.params.beneficiaryId, req.user.id]
  );
  if (result.rows.length === 0) throw new AppError('Beneficiary not found', 404);
  res.status(200).json({ success: true, message: 'Beneficiary deleted' });
});

// ─────────────────────────────────────────────
// POST /payments/send  (powered by Korapay)
// ─────────────────────────────────────────────
export const sendMoney = catchAsync(async (req, res) => {
  const { beneficiary_id, source_currency, destination_currency, source_amount, purpose = 'Personal Transfer' } = req.body;

  if (!beneficiary_id || !source_currency || !source_amount) {
    throw new AppError('beneficiary_id, source_currency, and source_amount are required', 400);
  }

  // 1. Compliance
  await complianceEngine.validateTransaction(req.user.id, source_amount, 'CROSS_BORDER_PAYMENT');

  // 2. Resolve beneficiary
  const beneficiary = await query('SELECT * FROM beneficiaries WHERE id = $1 AND user_id = $2', [beneficiary_id, req.user.id]);
  if (beneficiary.rows.length === 0) throw new AppError('Beneficiary not found', 404);
  const ben = beneficiary.rows[0];
  const benName = ben.name || ben.beneficiary_name;

  // 3. Resolve source wallet
  const sourceWallet = await query(
    'SELECT id, balance FROM wallets WHERE user_id = $1 AND currency = $2 AND is_active = true',
    [req.user.id, source_currency.toUpperCase()]
  );
  if (sourceWallet.rows.length === 0) throw new AppError(`No ${source_currency} wallet found`, 404);

  const rates = await getLiveRates();
  const rateKey = `${source_currency.toUpperCase()}_${(destination_currency || source_currency).toUpperCase()}`;
  const exchangeRate = rates[rateKey] || 1;
  const fee = parseFloat(source_amount) * 0.015;
  const totalDebit = parseFloat(source_amount) + fee;
  const destinationAmount = parseFloat(source_amount) * exchangeRate;
  const reference = `JAXO-PAY-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  if (parseFloat(sourceWallet.rows[0].balance) < totalDebit) {
    throw new AppError('Insufficient wallet balance (including 1.5% fee)', 400);
  }

  // 4. Record in DB via transactions table (actual DB table that exists)
  await transaction(async (client) => {
    await client.query('UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2', [totalDebit, sourceWallet.rows[0].id]);
    await client.query(
      `INSERT INTO transactions
         (user_id, from_wallet_id, transaction_type, from_amount, from_currency, to_amount, to_currency,
          exchange_rate, fee_amount, fee_currency, status, description, reference, metadata)
       VALUES ($1,$2,'cross_border_payment',$3,$4,$5,$6,$7,$8,$9,'processing',$10,$11,$12)`,
      [req.user.id, sourceWallet.rows[0].id,
        source_amount, source_currency.toUpperCase(),
      destinationAmount.toFixed(2), (destination_currency || source_currency).toUpperCase(),
        exchangeRate, fee, source_currency.toUpperCase(),
        purpose, reference,
      JSON.stringify({ beneficiary_id, beneficiary_name: benName, bank: ben.bank_name, account: ben.account_number })]
    );
  });

  // 5. Execute payout via Korapay
  let providerResult = null;
  let finalStatus = 'processing';

  try {
    providerResult = await korapay.execute({
      amount: source_amount,
      currency: source_currency.toUpperCase(),
      userId: req.user.id,
      type: 'payout',
      metadata: {
        reference,
        narration: purpose,
        destination: {
          type: 'bank_account',
          amount: destinationAmount,
          currency: (destination_currency || source_currency).toUpperCase(),
          bank_account: { bank: ben.bank_code, account: ben.account_number },
          customer: { name: benName }
        }
      }
    });

    finalStatus = providerResult.success ? 'processing' : 'failed';
  } catch (err) {
    logger.error('[Payments] Korapay payout error:', err.message);
    finalStatus = 'processing'; // webhook will finalize
  }

  await query('UPDATE transactions SET status = $1 WHERE reference = $2', [finalStatus, reference]);

  logger.info(`[Payments] ${reference} → Korapay → ${finalStatus}`);

  res.status(201).json({
    success: true,
    message: 'Payment initiated successfully',
    data: {
      reference,
      source_amount: parseFloat(source_amount),
      source_currency: source_currency.toUpperCase(),
      destination_amount: parseFloat(destinationAmount.toFixed(2)),
      destination_currency: (destination_currency || source_currency).toUpperCase(),
      exchange_rate: exchangeRate,
      fee: parseFloat(fee.toFixed(4)),
      status: finalStatus,
      provider: 'integrated',
      beneficiary: { name: benName, account: ben.account_number, bank: ben.bank_name }
    }
  });
});

// ─────────────────────────────────────────────
// GET /payments/history
// ─────────────────────────────────────────────
export const getPaymentHistory = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const offset = (page - 1) * limit;

  let conditions = "WHERE t.user_id = $1 AND t.transaction_type = 'cross_border_payment'";
  const params = [req.user.id];

  if (status) { params.push(status); conditions += ` AND t.status = $${params.length}`; }

  const result = await query(
    `SELECT t.id, t.from_amount as source_amount, t.from_currency as source_currency,
            t.to_amount as destination_amount, t.to_currency as destination_currency,
            t.exchange_rate, t.fee_amount as fee, t.status, t.description as purpose,
            t.reference, t.created_at, t.metadata
     FROM transactions t
     ${conditions} ORDER BY t.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const countResult = await query(`SELECT COUNT(*) as total FROM transactions t ${conditions}`, params);

  res.status(200).json({
    success: true,
    data: {
      payments: result.rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(countResult.rows[0].total), pages: Math.ceil(countResult.rows[0].total / limit) }
    }
  });
});

// ─────────────────────────────────────────────
// GET /payments/:paymentId
// ─────────────────────────────────────────────
export const getPayment = catchAsync(async (req, res) => {
  const result = await query(
    `SELECT t.id, t.from_amount as source_amount, t.from_currency as source_currency,
            t.to_amount as destination_amount, t.to_currency as destination_currency,
            t.exchange_rate, t.fee_amount as fee, t.status, t.description as purpose,
            t.reference, t.metadata, t.created_at, t.updated_at
     FROM transactions t
     WHERE t.id = $1 AND t.user_id = $2 AND t.transaction_type = 'cross_border_payment'`,
    [req.params.paymentId, req.user.id]
  );
  if (result.rows.length === 0) throw new AppError('Payment not found', 404);
  res.status(200).json({ success: true, data: result.rows[0] });
});

// ─────────────────────────────────────────────
// Helper: Live FX Rates
// ─────────────────────────────────────────────
async function getLiveRates() {
  const STATIC_RATES = {
    USD_NGN: 1580, USD_GHS: 12.8, USD_KES: 128, USD_ZAR: 18.4,
    EUR_NGN: 1720, EUR_GHS: 13.8, GBP_NGN: 2010,
    NGN_USD: 0.000633, GHS_USD: 0.078, KES_USD: 0.0078
  };

  try {
    // Try Korapay FX rates
    if (process.env.KORAPAY_SECRET_KEY) {
      const res = await axios.get('https://api.korapay.com/merchant/api/v1/misc/exchange-rates', {
        headers: { Authorization: `Bearer ${process.env.KORAPAY_SECRET_KEY}` },
        timeout: 3000
      });
      if (res.data?.data) {
        const live = {};
        res.data.data.forEach(r => { live[`${r.currency}_NGN`] = r.rate; });
        return { ...STATIC_RATES, ...live };
      }
    }
  } catch (e) {
    logger.warn('[Payments] Could not fetch live FX rates, using static:', e.message);
  }

  return STATIC_RATES;
}
