import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import emailService from '../services/email.service.js';
import VTpassAdapter from '../orchestration/adapters/utilities/VTpassAdapter.js';
import StrowalletBillsAdapter from '../orchestration/adapters/utilities/StrowalletBillsAdapter.js';
import fxService from '../orchestration/adapters/fx/GraphFinanceService.js';

const vtpass = new VTpassAdapter();
const strowalletBills = new StrowalletBillsAdapter();

/** VTpass is off for bills unless explicitly enabled (temporary suspension). */
function vtpassBillsEnabled() {
  return process.env.VTPASS_BILLS_ENABLED === 'true';
}

function inferStrowalletNetwork(serviceId) {
  const s = String(serviceId || '').toLowerCase();
  if (s.includes('mtn')) return 'mtn';
  if (s.includes('airtel')) return 'airtel';
  if (s.includes('glo')) return 'glo';
  if (s.includes('9mobile') || s.includes('etisalat')) return 'etisalat';
  return 'mtn';
}

function normalizeCableBrand(providerId) {
  const s = String(providerId || '').toLowerCase();
  if (s.includes('gotv')) return 'gotv';
  if (s.includes('startimes')) return 'startimes';
  if (s.includes('showmax')) return 'showmax';
  if (s.includes('dstv')) return 'dstv';
  return s.replace(/[^a-z0-9_-]/g, '') || 'dstv';
}

const STATIC_DISCOS = [
  { id: 'ikeja-electric', name: 'Ikeja Electric (IKEDC)', image_url: null, convinience_fee: null, fields: ['meter_number'], variations: [] },
  { id: 'eko-electric', name: 'Eko Electric (EKEDC)', image_url: null, convinience_fee: null, fields: ['meter_number'], variations: [] },
  { id: 'abuja-electric', name: 'Abuja Electricity (AEDC)', image_url: null, convinience_fee: null, fields: ['meter_number'], variations: [] },
  { id: 'kano-electric', name: 'Kano Electricity (KEDCO)', image_url: null, convinience_fee: null, fields: ['meter_number'], variations: [] },
  { id: 'kaduna-electric', name: 'Kaduna Electric (KAEDCO)', image_url: null, convinience_fee: null, fields: ['meter_number'], variations: [] },
  { id: 'jos-electric', name: 'Jos Electricity (JED)', image_url: null, convinience_fee: null, fields: ['meter_number'], variations: [] },
  { id: 'ibadan-electric', name: 'Ibadan Electric (IBEDC)', image_url: null, convinience_fee: null, fields: ['meter_number'], variations: [] },
  { id: 'enugu-electric', name: 'Enugu Electric (EEDC)', image_url: null, convinience_fee: null, fields: ['meter_number'], variations: [] },
  { id: 'benin-electric', name: 'Benin Electricity (BEDC)', image_url: null, convinience_fee: null, fields: ['meter_number'], variations: [] },
  { id: 'yola-electric', name: 'Yola Electricity (YEDC)', image_url: null, convinience_fee: null, fields: ['meter_number'], variations: [] },
  { id: 'port-harcourt-electric', name: 'Port Harcourt Electric (PHED)', image_url: null, convinience_fee: null, fields: ['meter_number'], variations: [] },
];

const STATIC_CABLE_PROVIDERS = [
  { id: 'dstv', name: 'DSTV Subscription', fields: ['smartcard_number'], image_url: null },
  { id: 'gotv', name: 'GOtv Subscription', fields: ['smartcard_number'], image_url: null },
  { id: 'startimes', name: 'Star Times Subscription', fields: ['smartcard_number'], image_url: null },
  { id: 'showmax', name: 'Showmax Subscription', fields: ['phone'], image_url: null },
];

function staticStrowalletNetworkProviders() {
  return [
    { id: 'mtn', name: 'MTN Nigeria', image_url: null, convinience_fee: null, fields: ['phone'], variations: [] },
    { id: 'airtel', name: 'Airtel Nigeria', image_url: null, convinience_fee: null, fields: ['phone'], variations: [] },
    { id: 'glo', name: 'Glo Nigeria', image_url: null, convinience_fee: null, fields: ['phone'], variations: [] },
    { id: '9mobile', name: '9mobile', image_url: null, convinience_fee: null, fields: ['phone'], variations: [] },
  ];
}

function staticEducationProviders() {
  return [
    {
      id: 'waec',
      name: 'WAEC Result Checker',
      image_url: null,
      convinience_fee: null,
      fields: ['phone'],
      variations: [],
    },
    {
      id: 'jamb',
      name: 'JAMB ePIN',
      image_url: null,
      convinience_fee: null,
      fields: ['phone'],
      variations: [],
    },
  ];
}

function staticEpinProviders() {
  return staticStrowalletNetworkProviders().map((p) => ({
    ...p,
    fields: ['phone'],
    description: 'Airtime recharge PIN (e-PIN)',
  }));
}

function inferCategoryFromProvider(providerId) {
  const s = String(providerId || '').toLowerCase();
  if (STATIC_DISCOS.some((d) => d.id === s)) return 'electricity';
  if (['dstv', 'gotv', 'startimes', 'showmax'].some((x) => s.includes(x))) return 'cable_tv';
  return null;
}

function coercePlanArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  let searchQueue = [payload];
  while (searchQueue.length > 0) {
    const current = searchQueue.shift();
    if (Array.isArray(current)) return current;
    
    if (current && typeof current === 'object') {
      if (Array.isArray(current.variations)) return current.variations;
      if (Array.isArray(current.varations)) return current.varations;
      if (Array.isArray(current.plans)) return current.plans;
      if (Array.isArray(current.products)) return current.products;
      if (Array.isArray(current.data)) return current.data;
      
      if (current.data && typeof current.data === 'object' && !Array.isArray(current.data)) searchQueue.push(current.data);
      if (current.content && typeof current.content === 'object' && !Array.isArray(current.content)) searchQueue.push(current.content);
      if (current.message && typeof current.message === 'object' && !Array.isArray(current.message)) searchQueue.push(current.message);
    }
  }
  return [];
}

function mapDataPlansToVariations(payload, network) {
  const list = coercePlanArray(payload);
  return list.map((row, i) => ({
    variation_code: String(
      row.id ?? row.plan_id ?? row.plan ?? row.dataplan ?? row.code ?? row.variation_code ?? `${network}-${i}`
    ),
    name: String(row.name ?? row.plan_name ?? row.title ?? row.variation_name ?? 'Data plan'),
    amount: row.amount ?? row.price ?? row.variation_amount ?? null,
  }));
}

function mapCablePlansToVariations(payload, cable) {
  const list = coercePlanArray(payload);
  return list.map((row, i) => ({
    variation_code: String(
      row.id ?? row.plan_id ?? row.plan ?? row.code ?? row.variation_code ?? `${cable}-${i}`
    ),
    name: String(row.name ?? row.plan_name ?? row.title ?? 'Cable plan'),
    amount: row.amount ?? row.price ?? row.variation_amount ?? null,
  }));
}

function mapSmePlansToProvider(payload) {
  const variations = coercePlanArray(payload).map((row, i) => ({
    variation_code: String(row.id ?? row.plan_id ?? row.dataplan ?? row.code ?? `sme-${i}`),
    name: String(row.name ?? row.plan_name ?? 'SME plan'),
    amount: row.amount ?? row.price ?? null,
  }));
  return [
    {
      id: 'sme',
      name: 'SME Data',
      image_url: null,
      convinience_fee: null,
      fields: ['phone'],
      variations,
    },
  ];
}

function mergeStrowalletFields(metadata, fields) {
  const extra = metadata?.strowallet && typeof metadata.strowallet === 'object' ? metadata.strowallet : {};
  return { ...fields, ...extra };
}

function extractVerifyCustomer(rawObj, accountNumber, meterType) {
  const d = rawObj?.data && typeof rawObj.data === 'object' ? rawObj.data : rawObj;
  const name =
    d?.customer_name ||
    d?.name ||
    d?.Customer_Name ||
    d?.customer ||
    d?.subscriber_name ||
    'N/A';
  return {
    account_number: accountNumber,
    customer_name: name,
    address: d?.address || d?.Address || '',
    meter_type: d?.meter_type || d?.Meter_Type || meterType,
    account_type: d?.account_type || d?.Customer_Account_Type || '',
    outstanding_balance: d?.outstanding_balance || d?.Outstanding_Balance || 0,
    minimum_amount: d?.minimum_amount || d?.Minimum_Amount || 0,
    can_vend: d?.can_vend !== false && d?.Can_Vend !== 'no',
    business_unit: d?.business_unit || d?.Business_Unit || '',
    validated: true,
  };
}

const BILL_CATEGORIES = [
  { id: 'electricity', name: 'Electricity', icon: '⚡', description: 'Prepaid & postpaid electricity top-up' },
  { id: 'cable_tv', name: 'Cable TV', icon: '📺', description: 'DSTV, GOtv, Startimes, Showmax' },
  { id: 'airtime', name: 'Airtime', icon: '📱', description: 'Buy mobile airtime for any network' },
  { id: 'data', name: 'Data Bundle', icon: '📶', description: 'Buy data bundles for any network' },
  { id: 'sme_data', name: 'SME Data', icon: '📡', description: 'SME data plans' },
  { id: 'epin', name: 'Recharge PIN', icon: '🎫', description: 'Airtime e-PIN (MTN, Glo, Airtel, 9mobile)' },
  { id: 'internet', name: 'Internet', icon: '🌐', description: 'Spectranet and other broadband providers' },
  { id: 'education', name: 'Education', icon: '🎓', description: 'WAEC, JAMB & more' },
];

// ──────────────────────────────────────────────────────────────────────
// GET /bills/categories
// ──────────────────────────────────────────────────────────────────────
export const getBillCategories = catchAsync(async (req, res) => {
  res.status(200).json({ success: true, data: BILL_CATEGORIES });
});

// ──────────────────────────────────────────────────────────────────────
// GET /bills/sme-transaction?reference=
// Proxies Strowallet SME transaction lookup (when not using VTpass for bills).
// ──────────────────────────────────────────────────────────────────────
export const getSmeTransactionStatus = catchAsync(async (req, res) => {
  const { reference } = req.query;
  if (!reference || !String(reference).trim()) {
    throw new AppError('reference query parameter is required', 400);
  }
  if (vtpassBillsEnabled()) {
    throw new AppError('SME query via Strowallet is only available when bills use Strowallet (VTPASS_BILLS_ENABLED is not true).', 400);
  }
  if (!strowalletBills.isConfigured()) {
    throw new AppError('Bill payment service is not configured.', 503);
  }
  const data = await strowalletBills.querySmeTransaction(String(reference).trim());
  res.status(200).json({ success: true, data, source: 'strowallet' });
});

// ──────────────────────────────────────────────────────────────────────
// GET /bills/providers?category=&network=&cable=
// Strowallet-first (default). VTpass only if VTPASS_BILLS_ENABLED=true.
// ──────────────────────────────────────────────────────────────────────
export const getBillProviders = catchAsync(async (req, res) => {
  const { category, network, cable } = req.query;
  if (!category) throw new AppError('category query parameter is required', 400);

  logger.info(`[Bills] Fetching providers for category: ${category}`);

  if (vtpassBillsEnabled()) {
    try {
      const providers = await vtpass.getProviders(category);
      if (!providers || providers.length === 0) {
        return res.status(200).json({
          success: true,
          data: [],
          message: 'No providers found for this category',
          source: 'vtpass',
        });
      }
      return res.status(200).json({ success: true, data: providers, source: 'vtpass' });
    } catch (err) {
      logger.error('[Bills] VTpass provider fetch failed:', err.message || err);
      throw new AppError(
        `Could not load providers: ${err.message || 'Service unavailable'}. Please try again.`,
        503
      );
    }
  }

  if (!strowalletBills.isConfigured()) {
    throw new AppError(
      'Bill payments use Strowallet. Set STROWALLET_PUBLIC_KEY and STROWALLET_SECRET_KEY, or set VTPASS_BILLS_ENABLED=true to use VTpass.',
      503
    );
  }

  const cat = String(category).toLowerCase();

  try {
    if (cat === 'airtime') {
      return res.status(200).json({
        success: true,
        data: staticStrowalletNetworkProviders(),
        source: 'strowallet',
      });
    }

    if (cat === 'data') {
      const net = network ? String(network).toLowerCase() : '';
      if (!net) {
        return res.status(200).json({
          success: true,
          data: staticStrowalletNetworkProviders(),
          source: 'strowallet',
          message: 'Pick a network, then call again with the same category and ?network=mtn|airtel|glo|9mobile (or etisalat) to load data plans.',
        });
      }
      const swNet = net === '9mobile' ? 'etisalat' : net;
      const raw = await strowalletBills.getDataPlans(swNet);
      const variations = mapDataPlansToVariations(raw, swNet);
      const providerId = net === '9mobile' ? '9mobile' : swNet;
      return res.status(200).json({
        success: true,
        data: [
          {
            id: providerId,
            name: `${providerId.toUpperCase()} Data`,
            image_url: null,
            convinience_fee: null,
            fields: ['phone'],
            variations,
          },
        ],
        source: 'strowallet',
      });
    }

    if (cat === 'cable_tv') {
      if (!cable) {
        return res.status(200).json({
          success: true,
          data: STATIC_CABLE_PROVIDERS,
          source: 'strowallet',
        });
      }
      const cab = normalizeCableBrand(cable);
      const raw = await strowalletBills.getCableTvPlans(cab);
      const variations = mapCablePlansToVariations(raw, cab);
      const providerInfo = STATIC_CABLE_PROVIDERS.find((p) => p.id === cab) || {
        id: cab,
        name: `${cab.toUpperCase()} subscription`,
        fields: ['smartcard_number'],
      };

      return res.status(200).json({
        success: true,
        data: [
          {
            ...providerInfo,
            variations,
          },
        ],
        source: 'strowallet',
      });
    }

    if (cat === 'electricity') {
      return res.status(200).json({
        success: true,
        data: STATIC_DISCOS,
        source: 'strowallet',
      });
    }

    if (cat === 'education') {
      return res.status(200).json({
        success: true,
        data: staticEducationProviders(),
        source: 'strowallet',
      });
    }

    if (cat === 'sme_data') {
      const raw = await strowalletBills.getSmePlans();
      return res.status(200).json({
        success: true,
        data: mapSmePlansToProvider(raw),
        source: 'strowallet',
      });
    }

    if (cat === 'epin') {
      return res.status(200).json({
        success: true,
        data: staticEpinProviders(),
        source: 'strowallet',
      });
    }

    if (cat === 'internet') {
      throw new AppError(
        'Internet / broadband is not available on Strowallet in this integration. Use mobile data or enable VTPASS_BILLS_ENABLED=true.',
        400
      );
    }

    throw new AppError(`Unsupported bill category: ${category}`, 400);
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error('[Bills] Strowallet provider fetch failed:', err.message || err);
    throw new AppError(
      `Could not load providers: ${err.message || 'Service unavailable'}. Please try again.`,
      err.statusCode === 503 ? 503 : 502
    );
  }
});

// ──────────────────────────────────────────────────────────────────────
// POST /bills/validate
// Body: { provider_id, account_number, bill_type?, category? }
// ──────────────────────────────────────────────────────────────────────
export const validateBillAccount = catchAsync(async (req, res) => {
  const { provider_id, account_number, bill_type, category: bodyCategory } = req.body;

  if (!provider_id || !account_number) {
    throw new AppError('provider_id and account_number are required', 400);
  }

  const meterType = bill_type || 'prepaid';
  const category =
    String(bodyCategory || inferCategoryFromProvider(provider_id) || '').toLowerCase() || null;

  logger.info(`[Bills] Validating: provider=${provider_id}, account=${account_number}, category=${category}`);

  if (vtpassBillsEnabled()) {
    try {
      const vtResult = await vtpass.validate({
        serviceID: provider_id,
        billersCode: account_number,
        type: meterType,
      });
      const content = vtResult?.content || {};
      const customerDetails = {
        account_number,
        customer_name: content.Customer_Name || content.customer_name || 'N/A',
        address: content.Address || content.address || '',
        meter_type: content.Meter_Type || content.meter_type || meterType,
        account_type: content.Customer_Account_Type || '',
        outstanding_balance: content.Outstanding_Balance || content.Customer_Arrears || 0,
        minimum_amount: content.Minimum_Amount || content.Min_Purchase_Amount || 0,
        can_vend: content.Can_Vend !== 'no',
        business_unit: content.Business_Unit || '',
        validated: true,
      };
      if (content.Can_Vend === 'no') {
        return res.status(200).json({
          success: false,
          message: 'This meter cannot be vended at this time. Please contact your DISCO.',
          data: customerDetails,
        });
      }
      return res.status(200).json({
        success: true,
        message: 'Account verified successfully',
        data: customerDetails,
      });
    } catch (err) {
      logger.error('[Bills] Validation failed:', err.message || err);
      const safeStatus = err.statusCode === 400 || err.statusCode === 503 ? err.statusCode : 502;
      throw new AppError(
        err.message || 'Account verification failed. Please check the number and try again.',
        safeStatus
      );
    }
  }

  if (!strowalletBills.isConfigured()) {
    throw new AppError('Bill verification is not configured.', 503);
  }

  if (!category || !['electricity', 'cable_tv'].includes(category)) {
    throw new AppError(
      'category is required for verification (electricity or cable_tv), or use a known provider_id.',
      400
    );
  }

  try {
    if (category === 'electricity') {
      const r = await strowalletBills.verifyElectricityMeter({
        meter_number: account_number,
        disco: provider_id,
        meter_type: meterType,
        type: meterType,
      });
      const customerDetails = extractVerifyCustomer(r.raw, account_number, meterType);
      if (customerDetails.can_vend === false) {
        return res.status(200).json({
          success: false,
          message: 'This meter cannot be vended at this time.',
          data: customerDetails,
        });
      }
      return res.status(200).json({
        success: true,
        message: 'Account verified successfully',
        data: customerDetails,
      });
    }

    if (category === 'cable_tv') {
      const cab = normalizeCableBrand(provider_id);
      const r = await strowalletBills.verifyCableSmartcard({
        smart_card_number: account_number,
        iuc: account_number,
        cable: cab,
      });
      const customerDetails = extractVerifyCustomer(r.raw, account_number, meterType);
      return res.status(200).json({
        success: true,
        message: 'Account verified successfully',
        data: customerDetails,
      });
    }
  } catch (err) {
    logger.error('[Bills] Strowallet validation failed:', err.message || err);
    const safeStatus = err.statusCode === 400 || err.statusCode === 422 || err.statusCode === 503 ? err.statusCode : 502;
    throw new AppError(
      err.message || 'Account verification failed. Please check the number and try again.',
      safeStatus
    );
  }

  throw new AppError('Unsupported verification category', 400);
});

// ──────────────────────────────────────────────────────────────────────
// POST /bills/pay
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

  if (targetCurrency !== 'NGN') {
    logger.info(`[Bills] FX required: NGN -> ${targetCurrency}`);
    const rateData = await fxService.getExchangeRate('NGN', targetCurrency);
    totalDebitInWalletCurrency = billingAmountInNaira * rateData.rate;
    logger.info(`[Bills] Converted: ${billingAmountInNaira} NGN = ${totalDebitInWalletCurrency} ${targetCurrency} (rate: ${rateData.rate})`);
  }

  const result = await transaction(async (client) => {
    const wallet = await client.query(
      `SELECT id, balance FROM wallets
       WHERE user_id = $1 AND currency = $2 AND is_active = true
       FOR UPDATE`,
      [req.user.id, currency.toUpperCase()]
    );

    if (wallet.rows.length === 0) throw new AppError(`No ${currency} wallet found`, 404);

    const fee = totalDebitInWalletCurrency * 0.005;
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
        req.user.id,
        provider_id,
        metadata?.category || 'utility',
        account_number,
        totalDebitInWalletCurrency,
        targetCurrency,
        fee,
        reference,
        JSON.stringify({ ...metadata, variation_code, naira_amount: billingAmountInNaira, reference }),
      ]
    );

    return {
      billPaymentId: billPayment.rows[0].id,
      walletId: wallet.rows[0].id,
      fee,
      reference,
      finalDebit,
    };
  });

  const cat = String(metadata?.category || '').toLowerCase();

  let providerStatus = 'processing';
  let providerRef = null;
  let token = null;
  let units = null;

  const refundAndFail = async (message) => {
    await query(
      'UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2',
      [result.finalDebit, result.walletId]
    );
    // transaction_status enum does not support 'refunded' (allowed: pending/processing/completed/failed/cancelled/reversed)
    await query(`UPDATE bill_payments SET status = 'reversed' WHERE id = $1`, [result.billPaymentId]);
    throw new AppError(message, 502);
  };

  const updateBillRow = async (status, ref) => {
    await query(
      `UPDATE bill_payments SET status = $1, provider_reference = $2, updated_at = NOW() WHERE id = $3`,
      [status, ref, result.billPaymentId]
    );
  };

  const applyVtpassResult = async (vtResult) => {
    providerStatus = vtResult.success ? 'completed' : 'failed';
    providerRef = vtResult.transactionId;
    token = vtResult.token;
    units = vtResult.units;
    await updateBillRow(providerStatus, providerRef);
    if (!vtResult.success) {
      await refundAndFail(
        `Bill payment was declined by ${provider_id}. Your wallet has been refunded.`
      );
    }
  };

  const vtPayload = {
    request_id: reference,
    serviceID: provider_id,
    billersCode: account_number,
    variation_code: variation_code || '',
    amount: parseFloat(amount),
    phone: phone || account_number,
  };

  const runStrowalletPay = async () => {
    if (!strowalletBills.isConfigured()) {
      await refundAndFail(
        'Bill payment service is not configured. Your wallet has been refunded.'
      );
    }

    const ph = phone || account_number;
    const amt = parseFloat(amount);
    const merge = (fields) => mergeStrowalletFields(metadata, fields);

    try {
      if (cat === 'airtime') {
        const fields = merge({
          phone: ph,
          amount: amt,
          network: inferStrowalletNetwork(provider_id),
        });
        const st = await strowalletBills.buyAirtime(fields);
        if (!st.success) {
          await refundAndFail(
            st.raw?.message || 'Airtime purchase was not successful. Your wallet has been refunded.'
          );
        }
        providerStatus = 'completed';
        providerRef = String(st.transactionId || st.raw?.trx_num || '').trim() || reference;
        await updateBillRow('completed', providerRef);
        return;
      }

      if (cat === 'data') {
        if (!variation_code) {
          await refundAndFail('Data bundle plan (variation_code / dataplan id) is required. Your wallet has been refunded.');
        }
        const net = inferStrowalletNetwork(provider_id);
        const swNet = net === '9mobile' ? 'etisalat' : net;
        const fields = merge({
          phone: ph,
          network: swNet,
          dataplan: variation_code,
          variation_code,
          amount: amt,
        });
        const st = await strowalletBills.buyData(fields);
        if (!st.success) {
          await refundAndFail(
            st.raw?.message || 'Data purchase was not successful. Your wallet has been refunded.'
          );
        }
        providerStatus = 'completed';
        providerRef = String(st.transactionId || st.raw?.trx_num || '').trim() || reference;
        await updateBillRow('completed', providerRef);
        return;
      }

      if (cat === 'sme_data') {
        if (!variation_code) {
          await refundAndFail('SME plan id (variation_code) is required. Your wallet has been refunded.');
        }
        const net = inferStrowalletNetwork(provider_id);
        const swNet = net === '9mobile' ? 'etisalat' : net;
        const fields = merge({
          phone: ph,
          network: swNet,
          dataplan: variation_code,
          amount: amt,
        });
        const st = await strowalletBills.buySmeData(fields);
        if (!st.success) {
          await refundAndFail(
            st.raw?.message || 'SME data purchase was not successful. Your wallet has been refunded.'
          );
        }
        providerStatus = 'completed';
        providerRef = String(st.transactionId || st.raw?.trx_num || '').trim() || reference;
        await updateBillRow('completed', providerRef);
        return;
      }

      if (cat === 'cable_tv') {
        if (!variation_code) {
          await refundAndFail('Cable plan (variation_code) is required. Your wallet has been refunded.');
        }
        const cab = normalizeCableBrand(provider_id);
        const fields = merge({
          smart_card_number: account_number,
          iuc: account_number,
          cable: cab,
          cable_plan: variation_code,
          plan: variation_code,
          amount: amt,
          phone: ph,
        });
        const st = await strowalletBills.subscribeCableTv(fields);
        if (!st.success) {
          await refundAndFail(
            st.raw?.message || 'Cable subscription was not successful. Your wallet has been refunded.'
          );
        }
        providerStatus = 'completed';
        providerRef = String(st.transactionId || st.raw?.trx_num || '').trim() || reference;
        await updateBillRow('completed', providerRef);
        return;
      }

      if (cat === 'electricity') {
        const mtype = variation_code === 'postpaid' ? 'postpaid' : 'prepaid';
        const fields = merge({
          meter_number: account_number,
          disco: String(provider_id).toLowerCase(),
          amount: amt,
          meter_type: mtype,
          type: mtype,
          phone: ph,
        });
        const st = await strowalletBills.subscribeElectricity(fields);
        if (!st.success) {
          await refundAndFail(
            st.raw?.message || 'Electricity payment was not successful. Your wallet has been refunded.'
          );
        }
        providerStatus = 'completed';
        providerRef = String(st.transactionId || st.raw?.trx_num || '').trim() || reference;
        token = st.token || null;
        units = st.units != null ? st.units : null;
        await updateBillRow('completed', providerRef);
        return;
      }

      if (cat === 'education') {
        const fields = merge({
          service: variation_code || provider_id,
          service_type: variation_code || provider_id,
          quantity: metadata.quantity != null ? String(metadata.quantity) : '1',
          amount: amt,
          phone: ph,
        });
        const st = await strowalletBills.buyEducational(fields);
        if (!st.success) {
          await refundAndFail(
            st.raw?.message || 'Educational purchase was not successful. Your wallet has been refunded.'
          );
        }
        providerStatus = 'completed';
        providerRef = String(st.transactionId || st.raw?.trx_num || '').trim() || reference;
        await updateBillRow('completed', providerRef);
        return;
      }

      if (cat === 'epin') {
        const fields = merge({
          network: inferStrowalletNetwork(provider_id),
          amount: amt,
          quantity: metadata.quantity != null ? String(metadata.quantity) : '1',
          phone: ph,
        });
        const st = await strowalletBills.buyEpin(fields);
        if (!st.success) {
          await refundAndFail(
            st.raw?.message || 'e-PIN purchase was not successful. Your wallet has been refunded.'
          );
        }
        providerStatus = 'completed';
        providerRef = String(st.transactionId || st.raw?.trx_num || '').trim() || reference;
        await updateBillRow('completed', providerRef);
        return;
      }

      await refundAndFail(
        `This bill category is not supported on Strowallet (${cat || 'unknown'}). Your wallet has been refunded.`
      );
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error('[Bills] Strowallet pay error:', err.message || err);
      await refundAndFail(
        err.message || 'Bill payment could not be completed. Your wallet has been refunded.'
      );
    }
  };

  try {
    if (vtpassBillsEnabled()) {
      try {
        logger.info(`[Bills] VTpass /pay: ${JSON.stringify(vtPayload)}`);
        const vtResult = await vtpass.execute(vtPayload);
        await applyVtpassResult(vtResult);
      } catch (vtErr) {
        if (vtErr instanceof AppError) throw vtErr;
        if (vtErr?.statusCode === 503) {
          await refundAndFail('Bill payment service is unavailable. Your wallet has been refunded.');
        }
        logger.error('[Bills] VTpass execute failed:', vtErr.message || vtErr);
        await refundAndFail('Bill payment could not be completed. Your wallet has been refunded.');
      }
    } else {
      await runStrowalletPay();
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw err;
  }

  const userProfile = await query('SELECT first_name FROM user_profiles WHERE user_id = $1', [req.user.id]);
  emailService
    .sendTransactionEmails(
      {
        id: result.billPaymentId,
        type: 'Bill Payment',
        amount,
        currency: currency.toUpperCase(),
        reference: result.reference,
        details: `Provider: ${provider_id} | Account: ${account_number}${token ? ` | Token: ${token}` : ''}`,
      },
      {
        name: userProfile.rows[0]?.first_name || 'User',
        email: req.user.email,
      }
    )
    .catch((e) => logger.error('Email send error:', e));

  res.status(201).json({
    success: true,
    message: providerStatus === 'completed' ? 'Bill payment successful!' : 'Bill payment initiated',
    data: {
      bill_payment_id: result.billPaymentId,
      reference: result.reference,
      amount: parseFloat(amount),
      currency: currency.toUpperCase(),
      fee: result.fee,
      total_debit: result.finalDebit != null ? result.finalDebit : parseFloat(amount) + result.fee,
      status: providerStatus,
      provider_reference: providerRef,
      token,
      units,
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

  if (provider_id) {
    params.push(provider_id);
    conditions += ` AND provider_id = $${params.length}`;
  }
  if (status) {
    params.push(status);
    conditions += ` AND status = $${params.length}`;
  }

  const result = await query(
    `SELECT id, provider_id, account_number, amount, currency, fee, status,
            reference, metadata, created_at
     FROM bill_payments ${conditions}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, parseInt(limit), offset]
  );

  const countResult = await query(`SELECT COUNT(*) as total FROM bill_payments ${conditions}`, params);

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
