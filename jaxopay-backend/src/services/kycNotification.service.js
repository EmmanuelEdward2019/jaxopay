import { query } from '../config/database.js';
import { sendEmail } from './email.service.js';
import logger from '../utils/logger.js';

const DOC_LABELS = {
  passport: 'Passport',
  national_id: 'National ID',
  drivers_license: "Driver's license",
  id_card: 'ID card',
  nin: 'NIN',
  bvn: 'BVN',
  proof_of_address: 'Proof of address',
  utility_bill: 'Utility bill',
  proof_of_income: 'Proof of income',
  smile_basic_kyc: 'Smile ID — basic identity check',
  smile_biometric_kyc: 'Smile ID — biometric / liveness',
};

const TIER_LABELS = {
  tier_0: 'Unverified',
  tier_1: 'Basic',
  tier_2: 'Verified',
};

function documentLabel(documentType) {
  return DOC_LABELS[documentType] || documentType || 'KYC document';
}

function tierLabel(tier) {
  if (tier == null) return '';
  const k = String(tier);
  return TIER_LABELS[k] || k.replace(/_/g, ' ');
}

function parseEmailList(value) {
  if (!value || typeof value !== 'string') return [];
  return [...new Set(value.split(',').map((e) => e.trim()).filter(Boolean))];
}

function staffRecipientList() {
  const compliance = parseEmailList(process.env.COMPLIANCE_EMAIL || '');
  const admin = parseEmailList(process.env.ADMIN_EMAIL || '');
  const seen = new Set();
  const out = [];
  for (const e of [...compliance, ...admin]) {
    const lower = e.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      out.push(e);
    }
  }
  return out;
}

function frontendBase() {
  return (process.env.FRONTEND_URL || 'https://jaxopay.com').replace(/\/$/, '');
}

async function getUserContact(userId) {
  const r = await query(
    `SELECT u.email, up.first_name, up.last_name
     FROM users u
     LEFT JOIN user_profiles up ON u.id = up.user_id
     WHERE u.id = $1`,
    [userId]
  );
  const row = r.rows[0];
  if (!row?.email) return null;
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || 'there';
  return { email: row.email, name };
}

async function sendStaffKycEmail({ subject, eventTitle, intro, rows, ctaPath }) {
  const to = staffRecipientList();
  if (to.length === 0) {
    logger.warn('[KYC email] Set COMPLIANCE_EMAIL and/or ADMIN_EMAIL to receive KYC alerts.');
    return;
  }
  const base = frontendBase();
  await sendEmail({
    to,
    subject,
    template: 'kycStaffNotification',
    data: {
      eventTitle,
      intro,
      rows,
      ctaUrl: ctaPath ? `${base}${ctaPath}` : `${base}/admin/kyc`,
      ctaText: 'Open KYC in admin',
    },
  });
}

function logEmailErr(context, err) {
  logger.error(`[KYC email] ${context}:`, err?.message || err);
}

/**
 * Manual document upload submitted — user confirmation + staff queue alert.
 */
export async function notifyManualKycSubmitted({ userId, documentType, tier, documentId }) {
  try {
    const contact = await getUserContact(userId);
    const label = documentLabel(documentType);
    const base = frontendBase();
    const dashboardUrl = `${base}/dashboard/kyc`;

    const userPromise = contact
      ? sendEmail({
          to: contact.email,
          subject: 'We received your KYC documents',
          template: 'kycUserSubmissionReceived',
          data: {
            name: contact.name,
            documentLabel: label,
            dashboardUrl,
            bodyExtra:
              'Your documents are pending review by our compliance team. We will email you when the review is complete.',
          },
        })
      : Promise.resolve();

    await Promise.all([
      userPromise.catch((e) => logEmailErr('notifyManualKycSubmitted user', e)),
      sendStaffKycEmail({
        subject: `[KYC] Manual submission pending: ${label}`,
        eventTitle: 'New manual KYC submission',
        intro: 'A user uploaded documents for manual review.',
        rows: [
          { label: 'User', value: contact?.email || userId },
          { label: 'Document', value: label },
          { label: 'Target tier', value: tierLabel(tier) },
          { label: 'Document ID', value: documentId },
        ],
      }).catch((e) => logEmailErr('notifyManualKycSubmitted staff', e)),
    ]);
  } catch (e) {
    logEmailErr('notifyManualKycSubmitted', e);
  }
}

/**
 * Smile Basic KYC job accepted — user + staff.
 */
export async function notifySmileBasicSubmitted({ userId, jobId }) {
  try {
    const contact = await getUserContact(userId);
    const base = frontendBase();
    const label = documentLabel('smile_basic_kyc');
    const userPromise = contact
      ? sendEmail({
          to: contact.email,
          subject: 'Identity verification submitted',
          template: 'kycUserSubmissionReceived',
          data: {
            name: contact.name,
            documentLabel: label,
            dashboardUrl: `${base}/dashboard/kyc`,
            bodyExtra:
              'Smile Identity is processing your details. We will email you when verification completes.',
          },
        })
      : Promise.resolve();

    await Promise.all([
      userPromise.catch((e) => logEmailErr('notifySmileBasicSubmitted user', e)),
      sendStaffKycEmail({
        subject: `[KYC] Smile Basic submitted (job ${jobId})`,
        eventTitle: 'Smile ID — basic check submitted',
        intro: 'A user started Smile Identity basic verification.',
        rows: [
          { label: 'User', value: contact?.email || userId },
          { label: 'Job ID', value: jobId },
        ],
      }).catch((e) => logEmailErr('notifySmileBasicSubmitted staff', e)),
    ]);
  } catch (e) {
    logEmailErr('notifySmileBasicSubmitted', e);
  }
}

/**
 * Smile Biometric KYC submitted — user + staff.
 */
export async function notifySmileBiometricSubmitted({ userId, jobId }) {
  try {
    const contact = await getUserContact(userId);
    const base = frontendBase();
    const label = documentLabel('smile_biometric_kyc');
    const userPromise = contact
      ? sendEmail({
          to: contact.email,
          subject: 'Biometric verification submitted',
          template: 'kycUserSubmissionReceived',
          data: {
            name: contact.name,
            documentLabel: label,
            dashboardUrl: `${base}/dashboard/kyc`,
            bodyExtra:
              'Smile Identity is processing your photos and ID. We will email you when verification completes.',
          },
        })
      : Promise.resolve();

    await Promise.all([
      userPromise.catch((e) => logEmailErr('notifySmileBiometricSubmitted user', e)),
      sendStaffKycEmail({
        subject: `[KYC] Smile Biometric submitted (job ${jobId})`,
        eventTitle: 'Smile ID — biometric verification submitted',
        intro: 'A user submitted biometric / liveness verification via Smile Identity.',
        rows: [
          { label: 'User', value: contact?.email || userId },
          { label: 'Job ID', value: jobId },
        ],
      }).catch((e) => logEmailErr('notifySmileBiometricSubmitted staff', e)),
    ]);
  } catch (e) {
    logEmailErr('notifySmileBiometricSubmitted', e);
  }
}

/**
 * Admin approved or rejected a document — user + staff audit.
 */
export async function notifyAdminKycDecision({
  userId,
  documentType,
  status,
  rejectionReason,
  reviewerEmail,
}) {
  try {
    const approved = status === 'approved';
    const contact = await getUserContact(userId);
    const tierRow = await query(`SELECT kyc_tier::text AS kyc_tier, kyc_status::text AS kyc_status FROM users WHERE id = $1`, [
      userId,
    ]);
    const kycTier = tierRow.rows[0]?.kyc_tier;
    const kycStatus = tierRow.rows[0]?.kyc_status;
    const label = documentLabel(documentType);
    const base = frontendBase();

    const userPromise = contact
      ? sendEmail({
          to: contact.email,
          subject: approved ? 'Your KYC was approved' : 'Update on your KYC submission',
          template: 'kycUserReviewResult',
          data: {
            name: contact.name,
            approved,
            documentLabel: label,
            rejectionReason: rejectionReason || '',
            newTierLabel: approved ? tierLabel(kycTier) : '',
            dashboardUrl: `${base}/dashboard/kyc`,
          },
        })
      : Promise.resolve();

    await Promise.all([
      userPromise.catch((e) => logEmailErr('notifyAdminKycDecision user', e)),
      sendStaffKycEmail({
        subject: `[KYC] Admin ${approved ? 'approved' : 'rejected'}: ${label}`,
        eventTitle: approved ? 'KYC document approved (manual review)' : 'KYC document rejected (manual review)',
        intro: 'An administrator completed a manual KYC review.',
        rows: [
          { label: 'User', value: contact?.email || userId },
          { label: 'Document', value: label },
          { label: 'Decision', value: approved ? 'Approved' : 'Rejected' },
          { label: 'Reviewer', value: reviewerEmail || '—' },
          ...(approved ? [{ label: 'User KYC tier (after)', value: tierLabel(kycTier) }] : []),
          ...(!approved && rejectionReason ? [{ label: 'Reason', value: rejectionReason }] : []),
          { label: 'User KYC status', value: kycStatus || '—' },
        ],
      }).catch((e) => logEmailErr('notifyAdminKycDecision staff', e)),
    ]);
  } catch (e) {
    logEmailErr('notifyAdminKycDecision', e);
  }
}

/**
 * Smile Identity webhook final result — user + staff (only when a document row was updated).
 */
export async function notifySmileKycWebhookResult({
  userId,
  jobId,
  documentType,
  approved,
  resultText,
}) {
  try {
    const contact = await getUserContact(userId);
    const tierRow = await query(`SELECT kyc_tier::text AS kyc_tier, kyc_status::text AS kyc_status FROM users WHERE id = $1`, [
      userId,
    ]);
    const kycTier = tierRow.rows[0]?.kyc_tier;
    const kycStatus = tierRow.rows[0]?.kyc_status;
    const label = documentLabel(documentType);
    const base = frontendBase();

    const userPromise = contact
      ? sendEmail({
          to: contact.email,
          subject: approved ? 'Identity verification approved' : 'Identity verification update',
          template: 'kycUserReviewResult',
          data: {
            name: contact.name,
            approved,
            documentLabel: label,
            rejectionReason: approved ? '' : resultText || 'Verification did not pass.',
            newTierLabel: approved ? tierLabel(kycTier) : '',
            dashboardUrl: `${base}/dashboard/kyc`,
          },
        })
      : Promise.resolve();

    await Promise.all([
      userPromise.catch((e) => logEmailErr('notifySmileKycWebhookResult user', e)),
      sendStaffKycEmail({
        subject: `[KYC] Smile ID ${approved ? 'approved' : 'rejected'} — ${label}`,
        eventTitle: approved ? 'Smile Identity: verification passed' : 'Smile Identity: verification did not pass',
        intro: 'Smile Identity returned a final result for a verification job.',
        rows: [
          { label: 'User', value: contact?.email || userId },
          { label: 'Job ID', value: jobId },
          { label: 'Document type', value: label },
          { label: 'Result', value: approved ? 'Approved' : 'Rejected' },
          ...(!approved && resultText ? [{ label: 'Provider message', value: resultText }] : []),
          { label: 'User KYC tier', value: tierLabel(kycTier) },
          { label: 'User KYC status', value: kycStatus || '—' },
        ],
      }).catch((e) => logEmailErr('notifySmileKycWebhookResult staff', e)),
    ]);
  } catch (e) {
    logEmailErr('notifySmileKycWebhookResult', e);
  }
}

/**
 * User requested tier upgrade via API after documents were already approved.
 */
export async function notifyTierSelfUpgrade({ userId, newTier }) {
  try {
    const contact = await getUserContact(userId);
    const base = frontendBase();
    const userPromise = contact
      ? sendEmail({
          to: contact.email,
          subject: 'Your verification level was updated',
          template: 'kycUserTierUpgraded',
          data: {
            name: contact.name,
            newTierLabel: tierLabel(newTier),
            dashboardUrl: `${base}/dashboard/kyc`,
          },
        })
      : Promise.resolve();

    await Promise.all([
      userPromise.catch((e) => logEmailErr('notifyTierSelfUpgrade user', e)),
      sendStaffKycEmail({
        subject: `[KYC] User tier self-upgrade → ${tierLabel(newTier)}`,
        eventTitle: 'User verification level updated (self-service)',
        intro: 'A user upgraded their KYC tier from the app after meeting document requirements.',
        rows: [
          { label: 'User', value: contact?.email || userId },
          { label: 'New tier', value: tierLabel(newTier) },
        ],
      }).catch((e) => logEmailErr('notifyTierSelfUpgrade staff', e)),
    ]);
  } catch (e) {
    logEmailErr('notifyTierSelfUpgrade', e);
  }
}
