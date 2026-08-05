import { query } from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Creates an in-app notification for a user (bell icon / notifications page). Never throws —
 * a notification failing to write must never break the underlying transaction/action it's
 * describing, so callers can safely fire-and-forget this.
 *
 * @param {string} userId
 * @param {object} p
 * @param {string} p.type - short category, e.g. 'deposit', 'withdrawal', 'bill_payment', 'card',
 *   'login', 'kyc', 'admin', 'compliance', 'security'
 * @param {string} p.title
 * @param {string} p.message
 * @param {object} [p.metadata] - structured extra data (reference, amount, currency, etc.)
 */
export async function notifyUser(userId, { type, title, message, metadata }) {
  try {
    await query(
      `INSERT INTO notifications (user_id, type, title, message, metadata, is_read)
       VALUES ($1, $2, $3, $4, $5, false)`,
      [userId, type, title, message, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (err) {
    logger.error(`[Notification] Failed to create '${type}' notification for ${userId}: ${err.message}`);
  }
}

/** Same notification to many users at once (e.g. admin/compliance broadcast). */
export async function notifyUsers(userIds, payload) {
  await Promise.all((userIds || []).map((id) => notifyUser(id, payload)));
}

// ── Convenience wrappers for the platform's most common events ──────────────────────────────

export const notifyDeposit = (userId, { amount, currency, reference }) =>
  notifyUser(userId, {
    type: 'deposit',
    title: 'Deposit received',
    message: `Your deposit of ${amount} ${currency} has been credited to your wallet.`,
    metadata: { reference, amount, currency },
  });

export const notifyWithdrawal = (userId, { amount, currency, status, reference }) =>
  notifyUser(userId, {
    type: 'withdrawal',
    title: status === 'failed' ? 'Withdrawal failed' : 'Withdrawal processed',
    message: status === 'failed'
      ? `Your withdrawal of ${amount} ${currency} could not be completed. Your funds have been returned.`
      : `Your withdrawal of ${amount} ${currency} has been processed.`,
    metadata: { reference, amount, currency, status },
  });

export const notifyBillPayment = (userId, { service, amount, currency, status, reference }) =>
  notifyUser(userId, {
    type: 'bill_payment',
    title: status === 'failed' ? 'Bill payment failed' : 'Bill payment successful',
    message: status === 'failed'
      ? `Your ${service} payment of ${amount} ${currency} failed. Your funds have been returned.`
      : `Your ${service} payment of ${amount} ${currency} was successful.`,
    metadata: { reference, service, amount, currency, status },
  });

export const notifyCard = (userId, { action, cardLast4, amount, currency }) =>
  notifyUser(userId, {
    type: 'card',
    title: `Card ${action}`,
    message: amount != null
      ? `Your card •••• ${cardLast4} was ${action} with ${amount} ${currency}.`
      : `Your card •••• ${cardLast4} was ${action}.`,
    metadata: { action, cardLast4, amount, currency },
  });

export const notifyLogin = (userId, { device, location, ipAddress }) =>
  notifyUser(userId, {
    type: 'login',
    title: 'New login to your account',
    message: `A new login was detected${device ? ` from ${device}` : ''}${location ? ` (${location})` : ''}. If this wasn't you, secure your account immediately.`,
    metadata: { device, location, ipAddress },
  });

export const notifyKyc = (userId, { tier, status, reason }) =>
  notifyUser(userId, {
    type: 'kyc',
    title: status === 'approved' ? `KYC Tier ${tier} approved` : status === 'rejected' ? 'KYC submission rejected' : 'KYC update',
    message: status === 'approved'
      ? `Your KYC Tier ${tier} verification has been approved. Your limits have been updated.`
      : status === 'rejected'
        ? `Your KYC submission was rejected.${reason ? ` Reason: ${reason}` : ''} Please resubmit.`
        : 'There has been an update to your KYC verification status.',
    metadata: { tier, status, reason },
  });

export const notifyCompliance = (userId, { title, message, metadata }) =>
  notifyUser(userId, { type: 'compliance', title, message, metadata });

export const notifyAdmin = (userId, { title, message, metadata }) =>
  notifyUser(userId, { type: 'admin', title, message, metadata });

export const notifySecurity = (userId, { title, message, metadata }) =>
  notifyUser(userId, { type: 'security', title, message, metadata });
