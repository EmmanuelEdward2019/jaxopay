import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_BUFFER = fs.readFileSync(path.join(__dirname, '../assets/jaxopay-logo.png'));

const BRAND_GREEN = '#16A34A';
const INK = '#0F172A';
const MUTED = '#64748B';
const HAIRLINE = '#EEF2F6';

/**
 * A single transaction's receipt, as a PDF.
 *
 * Why server-side: the mobile app's "Share Receipt" was sharing plain text, because rasterising a
 * view in React Native needs a native module (react-native-view-shot), and adding one forces a
 * full store rebuild — which breaks the OTA-only deploy this project relies on. Rendering the
 * receipt here with pdfkit (pure JS, already a dependency for statements) means the app only has
 * to download a file and hand it to the share sheet, which it already knows how to do. Ships over
 * OTA, and the shared document is identical on every device.
 *
 * The field list mirrors the on-screen receipt (web's utils/receiptFields.js and RN's
 * buildMetadataRows) so the shared PDF is the same document the customer is looking at.
 */

// What the number a bill was paid to is actually called, per bill type.
const BILL_ACCOUNT_LABELS = {
  airtime: 'Phone Number', data: 'Phone Number', electricity: 'Meter Number',
  cable: 'Smart Card Number', tv: 'Smart Card Number', internet: 'Account Number',
  water: 'Account Number',
};

const titleCase = (s) => String(s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

const formatAmount = (amount, currency) => {
  const n = Number(amount) || 0;
  const decimals = ['NGN', 'GHS', 'KES', 'ZAR', 'USD', 'EUR', 'GBP'].includes(String(currency).toUpperCase()) ? 2 : 8;
  const shown = n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
  return `${shown} ${String(currency || '').toUpperCase()}`.trim();
};

/** Receipt rows from a transaction's metadata — same order and fallbacks as the app's own view. */
function metadataRows(meta) {
  if (!meta || typeof meta !== 'object') return [];
  const out = [];
  const bankName = meta.bank_name || meta.networkName || meta.bank;
  const acctNumber = meta.account_number || meta.accountNumber || meta.account;
  const acctName = meta.account_name || meta.recipientName || meta.name;
  const network = meta.network || meta.cryptoNetwork;
  const address = meta.address || meta.walletAddress;
  if (bankName) out.push(['Bank', bankName]);
  if (acctNumber) out.push(['Account', acctNumber]);
  if (acctName) out.push(['Account Name', acctName]);
  if (meta.sender_name) out.push(['Sender', meta.sender_name]);
  if (meta.sender_bank) out.push(['Sender Bank', meta.sender_bank]);
  if (meta.sender_account) out.push(['Sender Account', meta.sender_account]);
  if (meta.payment_method) out.push(['Payment Method', meta.payment_method]);
  if (meta.narration) out.push(['Narration', meta.narration]);
  if (meta.package || meta.plan) out.push(['Package', meta.package || meta.plan]);
  if (meta.biller) out.push(['Biller', titleCase(meta.biller)]);
  if (meta.bill_account) out.push([BILL_ACCOUNT_LABELS[meta.service_type] || 'Account', meta.bill_account]);
  if (meta.customer_name) out.push(['Customer Name', meta.customer_name]);
  if (meta.units) out.push(['Units', meta.units]);
  if (network) out.push(['Network', network]);
  if (address) out.push(['Address', address]);
  if (meta.country) out.push(['Country', meta.country]);
  if (meta.session_id) out.push(['Session ID', meta.session_id]);
  if (meta.recipient_email) out.push(['Recipient', meta.recipient_email]);
  if (meta.sender_email) out.push(['Sender', meta.sender_email]);
  if (meta.token) out.push(['Token/PIN', meta.token]);
  if (meta.hash) out.push(['Transaction Hash', meta.hash]);
  return out;
}

/** @returns {Promise<Buffer>} */
export function buildReceiptPDF(tx, user) {
  const currencyForRows = tx.currency || tx.from_currency;
  const feeForRows = tx.fee ?? tx.fee_amount;
  // Built before the document exists so the page can be sized to the content. A receipt with a
  // half-empty page reads as a broken export when it lands in someone's WhatsApp.
  const rows = [
    ['Transaction Type', titleCase(tx.transaction_type)],
    ['Status', titleCase(tx.status)],
    ['Date & Time', new Date(tx.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })],
    tx.reference && ['Transaction ID', tx.reference],
    tx.description && ['Description', tx.description],
    feeForRows && Number(feeForRows) > 0 && ['Fee', formatAmount(feeForRows, currencyForRows)],
    tx.exchange_rate && ['Exchange Rate', `1 ${tx.from_currency || ''} = ${tx.exchange_rate} ${tx.to_currency || ''}`],
    ...metadataRows(tx.metadata),
  ].filter(Boolean);

  return new Promise((resolve, reject) => {
    // Receipt-shaped, not letter-shaped: A5 width, height sized to the rows this transaction
    // actually has. Long values (an address, a hash) wrap onto a second line, so allow for that
    // rather than assuming one line each.
    const PAGE_WIDTH = 419.5; // A5 width in points
    const longRows = rows.filter(([, v]) => String(v).length > 34).length;
    const contentHeight = 150 + rows.length * 20 + longRows * 10 + 70;
    const pageHeight = Math.min(Math.max(contentHeight, 300), 1400);
    const doc = new PDFDocument({ margin: 36, size: [PAGE_WIDTH, pageHeight] });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const left = 36;
    const contentWidth = pageWidth - left * 2;

    const status = String(tx.status || '').toLowerCase();
    const statusColor = status === 'completed' ? BRAND_GREEN
      : (status === 'pending' || status === 'processing') ? '#D97706'
        : '#DC2626';

    const currency = tx.currency || tx.from_currency;
    const isCredit = tx.direction === 'credit' || ['deposit', 'crypto_sell'].includes(tx.transaction_type);
    const amount = Math.abs(Number(tx.amount ?? tx.from_amount) || 0);

    // Brand strip + logo
    doc.rect(0, 0, pageWidth, 5).fill(BRAND_GREEN);
    doc.image(LOGO_BUFFER, left, 20, { width: 84 });

    doc.y = 62;
    doc.fontSize(8).fillColor(MUTED)
      .text('PROOF OF TRANSACTION', left, doc.y, { width: contentWidth, align: 'center', characterSpacing: 1.2 });

    doc.moveDown(0.6);
    doc.fontSize(21).fillColor(isCredit ? BRAND_GREEN : INK)
      .text(`${isCredit ? '+' : '-'}${formatAmount(amount, currency)}`, left, doc.y, { width: contentWidth, align: 'center' });

    doc.moveDown(0.4);
    doc.fontSize(10).fillColor(statusColor)
      .text(String(tx.status || '').toUpperCase(), left, doc.y, { width: contentWidth, align: 'center' });

    doc.moveDown(1.2);
    doc.moveTo(left, doc.y).lineTo(pageWidth - left, doc.y).strokeColor(BRAND_GREEN).lineWidth(1).stroke();
    doc.moveDown(0.8);

    const labelWidth = 118;
    const valueWidth = contentWidth - labelWidth - 8;
    for (const [label, value] of rows) {
      const text = String(value);
      // Measure first so a long value (an address, a hash) gets the row height it needs instead
      // of overlapping the row beneath it.
      const valueHeight = doc.fontSize(9).heightOfString(text, { width: valueWidth });
      const rowHeight = Math.max(valueHeight, 11) + 9;

      if (doc.y + rowHeight > doc.page.height - 60) {
        doc.addPage();
        doc.rect(0, 0, pageWidth, 5).fill(BRAND_GREEN);
        doc.y = 40;
      }

      const top = doc.y;
      doc.fontSize(9).fillColor(MUTED).text(label, left, top, { width: labelWidth });
      doc.fontSize(9).fillColor(label === 'Status' ? statusColor : INK)
        .text(text, left + labelWidth + 8, top, { width: valueWidth, align: 'right' });

      doc.y = top + rowHeight;
      doc.moveTo(left, doc.y - 4).lineTo(pageWidth - left, doc.y - 4).strokeColor(HAIRLINE).lineWidth(0.5).stroke();
    }

    doc.moveDown(1.2);
    doc.fontSize(8).fillColor(BRAND_GREEN)
      .text('POWERED BY JAXOPAY · jaxopay.com', left, doc.y, { width: contentWidth, align: 'center', characterSpacing: 0.5 });
    if (user?.email) {
      doc.moveDown(0.3);
      doc.fontSize(7.5).fillColor(MUTED)
        .text(`Issued to ${user.name || user.email}`, left, doc.y, { width: contentWidth, align: 'center' });
    }

    doc.end();
  });
}
