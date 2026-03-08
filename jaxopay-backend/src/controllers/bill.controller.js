import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import emailService from '../services/email.service.js';
import VTpassAdapter from '../orchestration/adapters/utilities/VTpassAdapter.js';
import fxService from '../orchestration/adapters/fx/GraphFinanceService.js';

const vtpass = new VTpassAdapter();

// Static category definitions (metadata only — providers come from VTpass live)
const BILL_CATEGORIES = [
  { id: 'electricity', name: 'Electricity', icon: '⚡', description: 'Prepaid & postpaid electricity top-up' },
  { id: 'cable_tv', name: 'Cable TV', icon: '📺', description: 'DSTV, GOtv, Startimes, Showmax' },
  { id: 'airtime', name: 'Airtime', icon: '📱', description: 'Buy mobile airtime for any network' },
  { id: 'data', name: 'Data Bundle', icon: '📶', description: 'Buy data bundles for any network' },
  { id: 'internet', name: 'Internet', icon: '🌐', description: 'Smile, Spectranet & more' },
  { id: 'education', name: 'Education', icon: '🎓', description: 'WAEC, JAMB & more' },
];

// ──────────────────────────────────────────────────────────────────────
// GET /bills/categories
// ──────────────────────────────────────────────────────────────────────
export const getBillCategories = catchAsync(async (req, res) => {
  res.status(200).json({ success: true, data: BILL_CATEGORIES });
});

// ──────────────────────────────────────────────────────────────────────
// GET /bills/providers?category=electricity
// Returns ALL providers for the category from VTpass live API.
// Electricity providers include their prepaid/postpaid variations.
// ──────────────────────────────────────────────────────────────────────
export const getBillProviders = catchAsync(async (req, res) => {
  const { category } = req.query;
  if (!category) throw new AppError('category query parameter is required', 400);

  logger.info(`[Bills] Fetching providers for category: ${category}`);

  try {
    const providers = await vtpass.getProviders(category);

    if (!providers || providers.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: 'No providers found for this category on VTpass',
        source: 'vtpass',
      });
    }

    logger.info(`[Bills] Returning ${providers.length} providers for "${category}" from VTpass`);
    return res.status(200).json({ success: true, data: providers, source: 'vtpass' });

  } catch (err) {
    logger.error('[Bills] VTpass provider fetch failed:', err.message || err);
    throw new AppError(
      `Could not load providers: ${err.message || 'VTpass API unavailable'}. Please try again.`,
      503
    );
  }
});

// ──────────────────────────────────────────────────────────────────────
// POST /bills/validate
// Real meter number / smartcard / phone verification via VTpass
// Body: { provider_id, account_number, bill_type }
//   bill_type = "prepaid" | "postpaid" (required for electricity)
// ──────────────────────────────────────────────────────────────────────
export const validateBillAccount = catchAsync(async (req, res) => {
  const { provider_id, account_number, bill_type } = req.body;

  if (!provider_id || !account_number) {
    throw new AppError('provider_id and account_number are required', 400);
  }

  logger.info(`[Bills] Validating: provider=${provider_id}, account=${account_number}, type=${bill_type}`);

  // Determine meter type — electricity always needs explicit prepaid/postpaid
  const meterType = bill_type || 'prepaid';

  try {
    const vtResult = await vtpass.validate({
      serviceID: provider_id,
      billersCode: account_number,
      type: meterType,
    });

    const content = vtResult?.content || {};

    // Build unified customer details from VTpass response
    const customerDetails = {
      account_number,
      customer_name: content.Customer_Name || content.customer_name || 'N/A',
      address: content.Address || content.address || '',
      meter_type: content.Meter_Type || content.meter_type || meterType,
      account_type: content.Customer_Account_Type || '',  // MD or NMD
      outstanding_balance: content.Outstanding_Balance || content.Customer_Arrears || 0,
      minimum_amount: content.Minimum_Amount || content.Min_Purchase_Amount || 0,
      can_vend: content.Can_Vend !== 'no',
      business_unit: content.Business_Unit || '',
      validated: true,
    };

    // Safety check — if Can_Vend is "no" from DISCO, block payment
    if (content.Can_Vend === 'no') {
      return res.status(200).json({
        success: false,
        message: 'This meter cannot be vended at this time. Please contact your DISCO.',
        data: customerDetails,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Account verified successfully',
      data: customerDetails,
    });

  } catch (err) {
    logger.error('[Bills] Validation failed:', err.message || err);
    // Never forward external API status codes (401/403) to the frontend —
    // the frontend treats 401 as JWT expiry and enters a refresh loop.
    const safeStatus = (err.statusCode === 400 || err.statusCode === 503) ? err.statusCode : 502;
    throw new AppError(
      err.message || 'Account verification failed. Please check the number and try again.',
      safeStatus
    );
  }
});

// ──────────────────────────────────────────────────────────────────────
// POST /bills/pay
// Body: { provider_id, account_number, amount, currency, variation_code, phone, metadata }
//   variation_code = "prepaid" | "postpaid" for electricity
//                 = e.g. "gotv-lite" for cable TV
//                 = e.g. "mtn-10mb-100" for data
// ──────────────────────────────────────────────────────────────────────
export const payBill = catchAsync(async (req, res) => {
  const {
    provider_id,
    account_number,
    amount,
    currency = 'NGN',
    variation_code = '',
    phone,
    metadata = {},
  } = req.body;

  if (!provider_id || !account_number) {
    throw new AppError('provider_id and account_number are required', 400);
  }
  if (!amount || parseFloat(amount) <= 0) {
    throw new AppError('A valid amount is required', 400);
  }

  const reference = `JAXO-BILL-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  let billingAmountInNaira = parseFloat(amount);
  let totalDebitInWalletCurrency = billingAmountInNaira;
  const targetCurrency = currency.toUpperCase();

  // 0. Handle FX if paying from non-NGN wallet
  // (Assuming VTpass always expects NGN amount)
  if (targetCurrency !== 'NGN') {
    logger.info(`[Bills] FX required: NGN -> ${targetCurrency}`);
    // We need rate for 1 NGN in targetCurrency
    const rateData = await fxService.getExchangeRate('NGN', targetCurrency);
    totalDebitInWalletCurrency = billingAmountInNaira * rateData.rate;
    logger.info(`[Bills] Converted: ${billingAmountInNaira} NGN = ${totalDebitInWalletCurrency} ${targetCurrency} (rate: ${rateData.rate})`);
  }

  // ── 1. Deduct wallet balance in DB transaction ──────────────────
  const result = await transaction(async (client) => {
    const wallet = await client.query(
      `SELECT id, balance FROM wallets
       WHERE user_id = $1 AND currency = $2 AND is_active = true
       FOR UPDATE`,
      [req.user.id, currency.toUpperCase()]
    );

    if (wallet.rows.length === 0) throw new AppError(`No ${currency} wallet found`, 404);

    const fee = totalDebitInWalletCurrency * 0.005; // 0.5%
    const finalDebit = totalDebitInWalletCurrency + fee;

    if (parseFloat(wallet.rows[0].balance) < finalDebit) {
      throw new AppError(
        `Insufficient balance. Need ${targetCurrency} ${finalDebit.toFixed(2)}, have ${targetCurrency} ${parseFloat(wallet.rows[0].balance).toFixed(2)}`,
        400
      );
    }

    await client.query(
      'UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2',
      [finalDebit, wallet.rows[0].id]
    );

    const billPayment = await client.query(
      `INSERT INTO bill_payments
         (user_id, provider_id, service_type, account_number, amount, currency, fee, status, reference, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'processing', $8, $9)
       RETURNING id, created_at`,
      [
        req.user.id, provider_id, metadata?.category || 'utility', account_number,
        totalDebitInWalletCurrency, targetCurrency,
        fee, reference,
        JSON.stringify({ ...metadata, variation_code, naira_amount: billingAmountInNaira, reference }),
      ]
    );

    return {
      billPaymentId: billPayment.rows[0].id,
      walletId: wallet.rows[0].id,
      fee,
      reference,
    };
  });

  // ── 2. Call VTpass /pay ─────────────────────────────────────────
  let providerStatus = 'processing';
  let providerRef = null;
  let token = null;
  let units = null;

  try {
    const vtPayload = {
      request_id: reference,
      serviceID: provider_id,
      billersCode: account_number,
      variation_code: variation_code || '',
      amount: parseFloat(amount),
      phone: phone || account_number,
    };

    logger.info(`[Bills] Calling VTpass /pay: ${JSON.stringify(vtPayload)}`);
    const vtResult = await vtpass.execute(vtPayload);

    providerStatus = vtResult.success ? 'completed' : 'failed';
    providerRef = vtResult.transactionId;
    token = vtResult.token;
    units = vtResult.units;

    logger.info(`[Bills] VTpass /pay result: status=${providerStatus}, ref=${providerRef}`);

    await query(
      `UPDATE bill_payments
       SET status = $1, provider_reference = $2, updated_at = NOW()
       WHERE id = $3`,
      [providerStatus, providerRef, result.billPaymentId]
    );

    // Refund if VTpass explicitly failed
    if (!vtResult.success) {
      await query(
        'UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2',
        [finalDebit, result.walletId]
      );
      await query(
        `UPDATE bill_payments SET status = 'refunded' WHERE id = $1`,
        [result.billPaymentId]
      );
      throw new AppError(
        `Bill payment was declined by ${provider_id}. Your wallet has been refunded.`,
        502
      );
    }

  } catch (err) {
    if (err.statusCode === 502 || err.isOperational) throw err;
    // Network timeout — keep as 'processing', webhook will finalize
    logger.error('[Bills] VTpass network error (will finalize via webhook):', err.message);
  }

  // ── 3. Email receipt ────────────────────────────────────────────
  const userProfile = await query(
    'SELECT first_name FROM user_profiles WHERE user_id = $1',
    [req.user.id]
  );
  emailService.sendTransactionEmails({
    id: result.billPaymentId,
    type: 'Bill Payment',
    amount,
    currency: currency.toUpperCase(),
    reference: result.reference,
    details: `Provider: ${provider_id} | Account: ${account_number}${token ? ` | Token: ${token}` : ''}`,
  }, {
    name: userProfile.rows[0]?.first_name || 'User',
    email: req.user.email,
  }).catch(e => logger.error('Email send error:', e));

  res.status(201).json({
    success: true,
    message: providerStatus === 'completed' ? 'Bill payment successful!' : 'Bill payment initiated',
    data: {
      bill_payment_id: result.billPaymentId,
      reference: result.reference,
      amount: parseFloat(amount),
      currency: currency.toUpperCase(),
      fee: result.fee,
      total_debit: parseFloat(amount) + result.fee,
      status: providerStatus,
      provider_reference: providerRef,
      token,        // electricity token
      units,        // electricity units (kWh)
    },
  });
});

// ──────────────────────────────────────────────────────────────────────
// GET /bills/history
// ──────────────────────────────────────────────────────────────────────
export const getBillHistory = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, provider_id, status } = req.query;
  const offset = (page - 1) * parseInt(limit);

  let conditions = 'WHERE user_id = $1';
  const params = [req.user.id];

  if (provider_id) { params.push(provider_id); conditions += ` AND provider_id = $${params.length}`; }
  if (status) { params.push(status); conditions += ` AND status = $${params.length}`; }

  const result = await query(
    `SELECT id, provider_id, account_number, amount, currency, fee, status,
            reference, metadata, created_at
     FROM bill_payments ${conditions}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, parseInt(limit), offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) as total FROM bill_payments ${conditions}`,
    params
  );

  res.status(200).json({
    success: true,
    data: {
      payments: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(parseInt(countResult.rows[0].total) / parseInt(limit)),
      },
    },
  });
});

// ──────────────────────────────────────────────────────────────────────
// GET /bills/:billPaymentId
// ──────────────────────────────────────────────────────────────────────
export const getBillPayment = catchAsync(async (req, res) => {
  const { billPaymentId } = req.params;

  const result = await query(
    `SELECT id, provider_id, account_number, amount, currency, fee, status,
            reference, metadata, created_at
     FROM bill_payments WHERE id = $1 AND user_id = $2`,
    [billPaymentId, req.user.id]
  );

  if (result.rows.length === 0) throw new AppError('Bill payment not found', 404);

  res.status(200).json({ success: true, data: result.rows[0] });
});
