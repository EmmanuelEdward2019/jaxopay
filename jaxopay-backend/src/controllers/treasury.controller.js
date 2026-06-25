import { query } from '../config/database.js';
import { catchAsync } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

import QuidaxAdapter from '../orchestration/adapters/crypto/QuidaxAdapter.js'; // exported instance
import KorapayAdapter from '../orchestration/adapters/payments/KorapayAdapter.js'; // class
import ReloadlyAdapter from '../orchestration/adapters/digital/ReloadlyAdapter.js'; // class
import graphFx from '../orchestration/adapters/fx/GraphFinanceService.js'; // exported instance

const korapay = new KorapayAdapter();
const reloadly = new ReloadlyAdapter();

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Treasury / Reconciliation overview for the admin dashboard.
 *
 * Two sides of the balance sheet:
 *   - FLOAT (assets): live balances held at each payment/crypto provider.
 *   - LIABILITIES: total balances we owe end-users (sum of their wallets).
 * Coverage = float − liabilities per currency (negative = under-funded).
 *
 * Each provider is fetched independently so one outage/unconfigured key does
 * not break the whole view.
 */
export const getTreasuryOverview = catchAsync(async (req, res) => {
  // ── Provider float fetchers (each returns normalized [{currency, available, pending}]) ──
  const providerFetchers = [
    {
      key: 'korapay',
      label: 'Korapay (Fiat)',
      run: async () => {
        const raw = await korapay.getBalances();
        const src = Array.isArray(raw) ? {} : (raw || {});
        return Object.entries(src).map(([currency, v]) => ({
          currency: currency.toUpperCase(),
          available: num(v?.available_balance ?? v?.balance),
          pending: num(v?.pending_balance),
        }));
      },
    },
    {
      key: 'quidax',
      label: 'Quidax (Crypto)',
      run: async () => {
        const raw = await quidaxWallets();
        return (raw || [])
          .map((w) => ({
            currency: (w.currency || w.coin || '').toUpperCase(),
            available: num(w.balance ?? w.available_balance),
            pending: num(w.locked),
          }))
          .filter((b) => b.currency && (b.available > 0 || b.pending > 0));
      },
    },
    {
      key: 'graph',
      label: 'Graph Finance (FX)',
      run: async () => {
        const raw = await graphFx.getWalletBalances();
        return Object.entries(raw || {}).map(([currency, v]) => ({
          currency: currency.toUpperCase(),
          available: num(typeof v === 'object' ? (v.balance ?? v.available) : v),
          pending: 0,
        }));
      },
    },
    {
      key: 'reloadly',
      label: 'Reloadly (Top-ups)',
      run: async () => {
        const raw = await reloadly.getBalance();
        return [{
          currency: (raw?.currencyCode || 'USD').toUpperCase(),
          available: num(raw?.balance),
          pending: 0,
        }];
      },
    },
  ];

  const settled = await Promise.allSettled(providerFetchers.map((p) => p.run()));

  const providers = settled.map((result, i) => {
    const { key, label } = providerFetchers[i];
    if (result.status === 'fulfilled') {
      return { key, label, status: 'ok', balances: result.value };
    }
    logger.warn(`[Treasury] ${key} balance fetch failed: ${result.reason?.message || result.reason}`);
    return { key, label, status: 'error', balances: [], error: 'Balance unavailable (provider not reachable or not configured)' };
  });

  // Strowallet exposes only per-card balances, no merchant float endpoint.
  providers.push({
    key: 'strowallet',
    label: 'Strowallet (Cards/Bills)',
    status: 'unavailable',
    balances: [],
    note: 'No merchant float API — funded on demand',
  });

  // ── Liabilities: what we owe end-users (their wallet balances) ──
  const liabRows = await query(
    `SELECT UPPER(currency::text) AS currency,
            COALESCE(wallet_type::text, 'fiat') AS wallet_type,
            SUM(balance)::numeric AS total,
            COUNT(*)::int AS wallets
     FROM wallets
     WHERE is_active = true
       AND COALESCE(wallet_type::text, 'fiat') <> 'system'
     GROUP BY UPPER(currency::text), COALESCE(wallet_type::text, 'fiat')
     ORDER BY 1`
  );

  const liabilitiesByCurrency = {};
  for (const r of liabRows.rows) {
    const cur = r.currency;
    liabilitiesByCurrency[cur] = liabilitiesByCurrency[cur] || { currency: cur, total: 0, wallets: 0, type: r.wallet_type };
    liabilitiesByCurrency[cur].total += num(r.total);
    liabilitiesByCurrency[cur].wallets += r.wallets;
  }
  const liabilities = Object.values(liabilitiesByCurrency).sort((a, b) => a.currency.localeCompare(b.currency));

  // ── Coverage: float (sum of provider available per currency) vs liabilities ──
  const floatByCurrency = {};
  for (const prov of providers) {
    for (const b of prov.balances) {
      floatByCurrency[b.currency] = (floatByCurrency[b.currency] || 0) + b.available;
    }
  }

  const currencies = new Set([...Object.keys(floatByCurrency), ...Object.keys(liabilitiesByCurrency)]);
  const coverage = [...currencies].sort().map((currency) => {
    const float = num(floatByCurrency[currency]);
    const owed = num(liabilitiesByCurrency[currency]?.total);
    const difference = float - owed;
    return { currency, float, liabilities: owed, difference, covered: difference >= 0 };
  });

  res.status(200).json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      providers,
      liabilities,
      coverage,
    },
  });
});

/**
 * Fund Movements — the internal double-entry ledger (wallet_ledger), newest first.
 * Every recorded movement appears as a debit on one account and a credit on another,
 * each with the running balance after the entry. Read-only.
 */
export const getFundMovements = catchAsync(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 25);
  const offset = (page - 1) * limit;

  // Transaction types that bring money INTO the platform float (vs. outflows like
  // withdrawals, transfers, bill payments, crypto/fiat swaps-out).
  const INFLOW_TYPES = new Set(['deposit', 'exchange_in', 'credit', 'refund']);

  const [rows, count] = await Promise.all([
    query(
      `SELECT t.id, t.transaction_type::varchar AS type, t.from_amount::numeric AS amount,
              t.from_currency::varchar AS currency, t.status::varchar AS status,
              t.reference, t.description, t.created_at,
              t.metadata->>'provider_reference' AS provider_reference,
              u.email AS email
       FROM transactions t
       LEFT JOIN users u ON u.id = t.user_id
       ORDER BY t.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    query(`SELECT COUNT(*)::int AS total FROM transactions`),
  ]);

  const movements = rows.rows.map((r) => {
    const txType = (r.type || '').toLowerCase();
    const isInflow = INFLOW_TYPES.has(txType);
    return {
      id: r.id,
      type: isInflow ? 'credit' : 'debit', // money in vs out
      txType: r.type,
      amount: num(r.amount),
      currency: (r.currency || '').toUpperCase(),
      status: r.status,
      account: r.email || 'Unknown account',
      description: r.description || '',
      reference: r.reference || null,
      providerReference: r.provider_reference || null,
      date: r.created_at,
    };
  });

  const total = count.rows[0].total;
  res.status(200).json({
    success: true,
    data: {
      movements,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
  });
});

// Quidax master wallets (handles either exported method name).
async function quidaxWallets() {
  if (typeof QuidaxAdapter.getUserWallets === 'function') return QuidaxAdapter.getUserWallets();
  if (typeof QuidaxAdapter.getAllWallets === 'function') return QuidaxAdapter.getAllWallets();
  return [];
}
