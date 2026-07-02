import { query } from '../config/database.js';
import logger from '../utils/logger.js';

/** Extract client IP + user agent from an Express request. */
export function getRequestContext(req) {
  let ip =
    (req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim() ||
    req?.ip ||
    req?.connection?.remoteAddress ||
    null;
  // Normalize IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 → 127.0.0.1) for the inet column.
  if (ip && ip.startsWith('::ffff:')) ip = ip.slice(7);
  const userAgent = req?.headers?.['user-agent'] || null;
  return { ip, userAgent };
}

/**
 * Write an audit/activity log entry. Never throws — logging must not break the
 * business flow. Populates the `audit_logs` table read by the profile activity
 * feed and the admin audit view.
 */
export async function recordAudit({
  userId = null,
  action,
  entityType = null,
  entityId = null,
  oldValues = null,
  newValues = null,
  ip = null,
  userAgent = null,
} = {}) {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        action,
        entityType,
        entityId,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        ip,
        userAgent,
      ]
    );
  } catch (e) {
    logger.warn('[Audit] Failed to record audit log:', e.message);
  }
}

/**
 * Fire-and-forget audit record from a request context. Does NOT await, so it
 * never delays the response.
 * @param {object} req  Express request (for ip/ua/user)
 * @param {object} opts { action, entityType?, entityId?, oldValues?, newValues?, userId? }
 */
export function auditFromReq(req, opts = {}) {
  const { ip, userAgent } = getRequestContext(req);
  const userId = opts.userId !== undefined ? opts.userId : req?.user?.id || null;
  recordAudit({ ...opts, userId, ip, userAgent }).catch(() => {});
}

export default { recordAudit, auditFromReq, getRequestContext };
