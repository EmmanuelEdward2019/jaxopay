import PDFDocument from 'pdfkit';
import { AppError } from '../middleware/errorHandler.js';
import { query } from '../config/database.js';

const PRESET_LABELS = {
  today: 'Today', this_week: 'This Week', last_7_days: 'Last 7 Days',
  this_month: 'This Month', last_month: 'Last Month', last_30_days: 'Last 30 Days',
  '6_months': 'Last 6 Months', '1_year': 'Last 1 Year', custom: 'Custom Range',
};

/**
 * Resolves a named date-range preset into concrete [start, end) bounds — kept server-side (not
 * duplicated per platform) so web and RN can never disagree on what "This Week" or "Last Month"
 * actually means. Uses server (UTC) time, matching how created_at is already handled everywhere
 * else in this codebase — no per-user timezone conversion exists elsewhere to be consistent with.
 * `custom` requires startDate/endDate (plain YYYY-MM-DD strings) from the caller; end is treated
 * as inclusive of that whole day, matching the fix already applied to the plain transaction list.
 */
export function resolveDateRange(preset, customStart, customEnd) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case 'today':
      return { startDate: startOfToday, endDate: now, label: PRESET_LABELS.today };
    case 'this_week': {
      // Monday-start week, matching the common convention this app's other date UIs assume.
      const day = startOfToday.getDay(); // 0=Sun..6=Sat
      const diffToMonday = day === 0 ? 6 : day - 1;
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - diffToMonday);
      return { startDate: start, endDate: now, label: PRESET_LABELS.this_week };
    }
    case 'last_7_days': {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 6); // today + 6 previous days = 7 days inclusive
      return { startDate: start, endDate: now, label: PRESET_LABELS.last_7_days };
    }
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: start, endDate: now, label: PRESET_LABELS.this_month };
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: start, endDate: end, label: PRESET_LABELS.last_month };
    }
    case 'last_30_days': {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 29);
      return { startDate: start, endDate: now, label: PRESET_LABELS.last_30_days };
    }
    case '6_months': {
      const start = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
      return { startDate: start, endDate: now, label: PRESET_LABELS['6_months'] };
    }
    case '1_year': {
      const start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      return { startDate: start, endDate: now, label: PRESET_LABELS['1_year'] };
    }
    case 'custom': {
      if (!customStart || !customEnd) throw new AppError('start_date and end_date are required for a custom range', 400);
      const start = new Date(customStart);
      const end = new Date(customEnd);
      end.setDate(end.getDate() + 1); // inclusive of the whole end_date day
      if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new AppError('Invalid start_date or end_date', 400);
      return { startDate: start, endDate: end, label: `${customStart} – ${customEnd}` };
    }
    default:
      throw new AppError(`Unknown date range preset: ${preset}`, 400);
  }
}

/**
 * Statement generation — a separate, purpose-built query from getTransactions' combinedQuery.
 * That query's CASE mapping collapses swap/crypto_onramp/crypto_offramp all into one 'exchange'
 * label, which is fine for a generic activity feed but too lossy to offer a "Swap" filter
 * distinct from "Crypto" here — so this queries the 4 source tables directly, keyed by category:
 *   Crypto = all of wallet_transactions (exclusively the crypto wallet ledger) + fx_transactions
 *            where type IN ('crypto_onramp','crypto_offramp','payment_collection')
 *   Swap   = fx_transactions where type = 'swap'
 *   Fiat   = transactions (bank_transfer/deposit) + fx_transactions where type = 'international_payment'
 *   Bills  = bill_payments
 * is_credit mirrors (and slightly extends) the existing frontend heuristic
 * (Transactions.jsx's getTransactionColors / isCredit): deposit, exchange_in, and
 * payment_collection are genuinely money arriving in the user's own wallet; everything else here
 * is a debit. Kept in sync with the frontend's own classification — see the matching comment
 * where isCredit is defined on web/RN.
 */

function fiatQuery(paramOffset) {
  return `
    SELECT t.id, t.transaction_type::varchar as type, t.from_amount::numeric as amount, t.from_currency::varchar as currency,
           t.status::varchar as status, t.description::text as description, t.reference::varchar as reference, t.created_at,
           (t.transaction_type = 'deposit') as is_credit, 'Fiat'::varchar as category
    FROM transactions t
    WHERE t.user_id = $1 AND t.created_at >= $${paramOffset} AND t.created_at < $${paramOffset + 1}

    UNION ALL

    SELECT fx.id, 'international_payment'::varchar as type, fx.amount::numeric, fx.from_currency::varchar as currency,
           (CASE UPPER(fx.status) WHEN 'SUCCESS' THEN 'completed' WHEN 'PROCESSING' THEN 'pending' WHEN 'FAILED' THEN 'failed' ELSE LOWER(fx.status) END)::varchar as status,
           ('International Transfer to ' || COALESCE(fx.recipient_details->>'name', fx.to_currency))::text as description,
           fx.provider_txn_id::varchar as reference, fx.created_at,
           false as is_credit, 'Fiat'::varchar as category
    FROM fx_transactions fx
    WHERE fx.user_id = $1 AND fx.type = 'international_payment' AND fx.created_at >= $${paramOffset} AND fx.created_at < $${paramOffset + 1}
  `;
}

function cryptoQuery(paramOffset) {
  return `
    SELECT wtx.id, wtx.transaction_type::varchar as type, wtx.amount::numeric, wtx.currency::varchar as currency,
           wtx.status::varchar as status, wtx.description::text as description,
           COALESCE(wtx.metadata->>'obiex_tx_id', wtx.metadata->>'obiex_withdraw_id', wtx.metadata->>'provider_swap_id')::varchar as reference,
           wtx.created_at,
           (wtx.transaction_type IN ('deposit', 'exchange_in')) as is_credit, 'Crypto'::varchar as category
    FROM wallet_transactions wtx
    JOIN wallets w ON w.id = wtx.wallet_id
    WHERE w.user_id = $1 AND wtx.created_at >= $${paramOffset} AND wtx.created_at < $${paramOffset + 1}

    UNION ALL

    SELECT fx.id, fx.type::varchar as type,
           -- payment_collection's meaningful amount is what actually landed in the user's own
           -- stablecoin wallet (converted_amount/to_currency), not the payer's side
           -- (amount/from_currency) — unlike onramp/offramp, which debit the user's own
           -- from_currency wallet, so amount/from_currency is correct for those two.
           (CASE WHEN fx.type = 'payment_collection' THEN fx.converted_amount ELSE fx.amount END)::numeric as amount,
           (CASE WHEN fx.type = 'payment_collection' THEN fx.to_currency ELSE fx.from_currency END)::varchar as currency,
           (CASE UPPER(fx.status) WHEN 'SUCCESS' THEN 'completed' WHEN 'PROCESSING' THEN 'pending' WHEN 'FAILED' THEN 'failed' ELSE LOWER(fx.status) END)::varchar as status,
           (CASE fx.type
              WHEN 'crypto_onramp' THEN 'Bought ' || fx.to_currency || ' with ' || fx.from_currency
              WHEN 'crypto_offramp' THEN 'Sold ' || fx.from_currency || ' for ' || fx.to_currency
              ELSE 'Payment Collection: received ' || fx.to_currency
            END)::text as description,
           fx.provider_txn_id::varchar as reference, fx.created_at,
           (fx.type = 'payment_collection') as is_credit, 'Crypto'::varchar as category
    FROM fx_transactions fx
    WHERE fx.user_id = $1 AND fx.type IN ('crypto_onramp', 'crypto_offramp', 'payment_collection')
      AND fx.created_at >= $${paramOffset} AND fx.created_at < $${paramOffset + 1}
  `;
}

function swapQuery(paramOffset) {
  return `
    SELECT fx.id, 'swap'::varchar as type, fx.amount::numeric, fx.from_currency::varchar as currency,
           (CASE UPPER(fx.status) WHEN 'SUCCESS' THEN 'completed' WHEN 'PROCESSING' THEN 'pending' WHEN 'FAILED' THEN 'failed' ELSE LOWER(fx.status) END)::varchar as status,
           ('Currency Swap: ' || fx.from_currency || ' → ' || fx.to_currency)::text as description,
           fx.provider_txn_id::varchar as reference, fx.created_at,
           false as is_credit, 'Swap'::varchar as category
    FROM fx_transactions fx
    WHERE fx.user_id = $1 AND fx.type = 'swap' AND fx.created_at >= $${paramOffset} AND fx.created_at < $${paramOffset + 1}
  `;
}

function billsQuery(paramOffset) {
  return `
    SELECT bp.id, 'bill_payment'::varchar as type, bp.amount::numeric, bp.currency::varchar as currency,
           bp.status::varchar as status, ('Bill Payment: ' || bp.service_type)::text as description,
           bp.reference::varchar as reference, bp.created_at,
           false as is_credit, 'Bills'::varchar as category
    FROM bill_payments bp
    WHERE bp.user_id = $1 AND bp.created_at >= $${paramOffset} AND bp.created_at < $${paramOffset + 1}
  `;
}

const QUERY_BUILDERS = { fiat: fiatQuery, crypto: cryptoQuery, swap: swapQuery, bills: billsQuery };

/**
 * @param {string} userId
 * @param {object} filters direction('all'|'credit'|'debit'), category('all'|'fiat'|'crypto'|'swap'|'bills'),
 *   startDate, endDate (Date objects, required — callers resolve the preset/custom range first)
 */
export async function getStatementRows(userId, { direction = 'all', category = 'all', startDate, endDate }) {
  const categories = category === 'all' ? Object.keys(QUERY_BUILDERS) : [category];

  // Each category branch needs its own pair of $N placeholders — build them with real, sequential
  // offsets rather than assuming a fixed position, since the number of unioned branches varies.
  let paramCount = 1;
  const realParams = [userId];
  const pieces = categories.map((c) => {
    const offset = paramCount + 1;
    paramCount += 2;
    realParams.push(startDate, endDate);
    return QUERY_BUILDERS[c](offset);
  });

  let sql = `WITH combined AS (${pieces.join(' UNION ALL ')}) SELECT * FROM combined`;
  const conditions = [];
  if (direction === 'credit') conditions.push('is_credit = true');
  if (direction === 'debit') conditions.push('is_credit = false');
  if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
  sql += ' ORDER BY created_at DESC LIMIT 10000';

  const result = await query(sql, realParams);
  const rows = result.rows;

  const summary = { count: rows.length, byCurrency: {} };
  for (const r of rows) {
    const cur = r.currency;
    summary.byCurrency[cur] = summary.byCurrency[cur] || { credit: 0, debit: 0 };
    const amt = parseFloat(r.amount) || 0;
    if (r.is_credit) summary.byCurrency[cur].credit += amt;
    else summary.byCurrency[cur].debit += amt;
  }

  return { rows, summary };
}

const CSV_HEADERS = ['Date', 'Type', 'Description', 'Direction', 'Amount', 'Currency', 'Status', 'Reference'];

export function buildStatementCSV(rows) {
  const lines = [CSV_HEADERS.join(',')];
  for (const r of rows) {
    lines.push([
      new Date(r.created_at).toISOString(),
      r.type,
      `"${(r.description || '').replace(/"/g, '""')}"`,
      r.is_credit ? 'Credit' : 'Debit',
      r.amount,
      r.currency,
      r.status,
      r.reference || '',
    ].join(','));
  }
  return lines.join('\n');
}

export function buildStatementPDF(user, { rows, summary }, filterLabel) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).fillColor('#0F172A').text('JAXOPAY Statement', { align: 'left' });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#64748B').text(`${user.name || user.email}  ·  ${user.email}`);
    doc.text(filterLabel);
    doc.text(`Generated ${new Date().toLocaleString()}`);
    doc.moveDown(1);

    doc.fontSize(12).fillColor('#0F172A').text('Summary', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#334155');
    const currencies = Object.keys(summary.byCurrency);
    if (currencies.length === 0) {
      doc.text('No transactions in this range.');
    } else {
      for (const cur of currencies) {
        const s = summary.byCurrency[cur];
        doc.text(`${cur}:  Credit ${s.credit.toFixed(2)}   Debit ${s.debit.toFixed(2)}`);
      }
    }
    doc.text(`Total transactions: ${summary.count}`);
    doc.moveDown(1);

    doc.fontSize(12).fillColor('#0F172A').text('Transactions', { underline: true });
    doc.moveDown(0.5);

    const colX = { date: 40, type: 130, desc: 220, dir: 380, amount: 430, status: 500 };
    const rowH = 16;
    const drawHeader = () => {
      doc.fontSize(8).fillColor('#64748B');
      doc.text('Date', colX.date, doc.y, { width: 85, continued: false });
      doc.text('Type', colX.type, doc.y - 10, { width: 85 });
      doc.text('Description', colX.desc, doc.y - 10, { width: 155 });
      doc.text('Dir', colX.dir, doc.y - 10, { width: 45 });
      doc.text('Amount', colX.amount, doc.y - 10, { width: 65 });
      doc.text('Status', colX.status, doc.y - 10, { width: 60 });
      doc.moveDown(0.8);
      doc.moveTo(40, doc.y).lineTo(560, doc.y).strokeColor('#E2E8F0').stroke();
      doc.moveDown(0.3);
    };
    drawHeader();

    doc.fontSize(8).fillColor('#0F172A');
    for (const r of rows) {
      if (doc.y > 760) {
        doc.addPage();
        drawHeader();
      }
      const y = doc.y;
      doc.text(new Date(r.created_at).toLocaleDateString(), colX.date, y, { width: 85 });
      doc.text(String(r.type || '').replace(/_/g, ' '), colX.type, y, { width: 85 });
      doc.text(String(r.description || ''), colX.desc, y, { width: 155 });
      doc.text(r.is_credit ? 'Credit' : 'Debit', colX.dir, y, { width: 45 });
      doc.text(`${r.amount} ${r.currency}`, colX.amount, y, { width: 65 });
      doc.text(String(r.status || ''), colX.status, y, { width: 60 });
      doc.y = y + rowH;
    }

    doc.end();
  });
}
