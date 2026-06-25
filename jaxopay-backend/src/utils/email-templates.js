/**
 * Email Templates for JAXOPAY
 *
 * Built for real-world email clients: inline styles + table-based layout only
 * (no <style> blocks or flexbox, which Gmail/Outlook strip or ignore). Light /
 * white corporate theme with the JAXOPAY logo in the header of every email.
 */

// Public, absolute URL to the logo (email clients can't load relative/local paths).
// Defaults to the marketing domain, which serves the asset (the app/API domain does not).
// Override with EMAIL_LOGO_URL if the logo is hosted elsewhere.
const LOGO_URL = process.env.EMAIL_LOGO_URL || 'https://jaxopay.com/logo.png';

// Brand palette
const BRAND_GREEN = '#16a34a';
const BRAND_NAVY = '#1e3a8a';
const INK = '#0f172a';
const BODY_TEXT = '#334155';
const MUTED = '#64748b';
const BORDER = '#e6eaf0';
const SOFT = '#f8fafc';

const FONT = `'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

/** A bulletproof, email-safe heading. */
const heading = (text) =>
  `<h1 style="margin:0 0 18px;font-family:${FONT};font-size:23px;line-height:1.3;color:${INK};font-weight:700;">${text}</h1>`;

/** A solid, centered call-to-action button (table-based for Outlook). */
const button = (href, label, bg = BRAND_GREEN) => `
  <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:28px auto;">
    <tr>
      <td align="center" bgcolor="${bg}" style="border-radius:8px;">
        <a href="${href}" target="_blank" style="display:inline-block;padding:14px 34px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px;background:${bg};">${label}</a>
      </td>
    </tr>
  </table>`;

/** One label/value line inside an info box. Label sits in a narrow fixed column;
 *  the value fills the remaining horizontal width on the same line. */
const row = (label, value, valueColor = INK) => `
  <tr>
    <td width="132" style="padding:9px 0;border-bottom:1px solid #eef2f6;font-family:${FONT};font-size:13px;color:${MUTED};vertical-align:top;white-space:nowrap;width:132px;">${label}</td>
    <td style="padding:9px 0;border-bottom:1px solid #eef2f6;font-family:${FONT};font-size:14px;color:${valueColor};font-weight:600;text-align:left;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">${value}</td>
  </tr>`;

/** Wraps label/value rows in a light card. */
const infoBox = (rowsHtml) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SOFT};border:1px solid #eef2f6;border-radius:10px;margin:22px 0;">
    <tr>
      <td style="padding:4px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rowsHtml}</table>
      </td>
    </tr>
  </table>`;

const divider = () =>
  `<div style="height:1px;line-height:1px;font-size:0;background:#eef2f6;margin:28px 0;">&nbsp;</div>`;

const p = (text, extra = '') =>
  `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.65;color:${BODY_TEXT};${extra}">${text}</p>`;

const layout = (content) => `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light only" />
    <title>JAXOPAY</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f6f8;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f8;">
      <tr>
        <td align="center" style="padding:32px 14px;">
          <table role="presentation" width="680" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:680px;">
            <!-- Logo -->
            <tr>
              <td align="center" style="padding:4px 0 26px;">
                <img src="${LOGO_URL}" alt="JAXOPAY" width="168" style="display:block;width:168px;max-width:62%;height:auto;border:0;outline:none;text-decoration:none;" />
              </td>
            </tr>
            <!-- Card -->
            <tr>
              <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;overflow:hidden;">
                <div style="height:4px;font-size:0;line-height:0;background:${BRAND_GREEN};">&nbsp;</div>
                <div style="padding:34px 32px 30px;">
                  ${content}
                </div>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td align="center" style="padding:24px 20px 4px;font-family:${FONT};font-size:13px;line-height:1.7;color:#94a3b8;">
                <p style="margin:0 0 4px;font-weight:600;color:#64748b;">JAXOPAY — Cross-Border Fintech</p>
                <p style="margin:0 0 4px;">&copy; ${new Date().getFullYear()} JAXOPAY. All rights reserved.</p>
                <p style="margin:0;">This is an automated message — please do not reply.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

export const templates = {
  signup: (data) => layout(`
    ${heading('Welcome to JAXOPAY! 🚀')}
    ${p(`Hi ${data.name},`)}
    ${p(`We're excited to have you join our global fintech community. To get started, please confirm your email address.`)}
    ${button(data.verificationLink, 'Verify Email Address')}
    ${p(`If the button doesn't work, copy and paste this link into your browser:`)}
    ${p(`<span style="word-break:break-all;font-size:14px;color:${MUTED};">${data.verificationLink}</span>`)}
    ${divider()}
    ${p('Need help? Our support team is always here for you.')}
  `),

  forgotPassword: (data) => layout(`
    ${heading('Reset Your Password')}
    ${p(`Hi ${data.name},`)}
    ${p('You recently requested to reset your password for your JAXOPAY account. Click the button below to set a new password:')}
    ${button(data.resetLink, 'Reset Password')}
    ${p(`This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.`)}
    ${divider()}
    ${p('For your security, never share this link with anyone.')}
  `),

  transaction: (data) => {
    // Status-aware so failure notifications (e.g. a failed withdrawal) don't claim success.
    // Default (no status passed) keeps the original "processed successfully / Completed" wording.
    const isFailure = /fail|declin|revers|cancel|unsuccessful/i.test(`${data.status || ''} ${data.type || ''}`);
    const statusLabel = data.status || (isFailure ? 'Failed' : 'Completed');
    const statusColor = isFailure ? '#dc2626' : BRAND_GREEN;
    const intro = isFailure
      ? `Your recent <span style="color:#dc2626;font-weight:600;">${data.type}</span> transaction could not be completed.`
      : `Your recent <span style="color:${BRAND_GREEN};font-weight:600;">${data.type}</span> transaction has been processed successfully.`;
    return layout(`
    ${heading('Transaction Notification')}
    ${p(`Hello ${data.name},`)}
    ${p(intro)}
    ${infoBox(`
      ${row('Reference', data.reference)}
      ${data.id ? row('Transaction ID', data.id) : ''}
      ${row('Amount', `${data.currency} ${data.amount}`)}
      ${row('Status', statusLabel, statusColor)}
      ${row('Date', data.date || new Date().toLocaleString())}
    `)}
    ${data.details ? `<div style="margin:-8px 0 20px;font-family:${FONT};font-size:14px;color:#4b5563;"><strong>Details:</strong><br/>${data.details}</div>` : ''}
    ${p('Thank you for choosing JAXOPAY for your global transactions.')}
  `);
  },

  adminTransactionAlert: (data) => layout(`
    ${heading('System Alert: New Transaction')}
    ${p('An important transaction has occurred on the platform:')}
    ${infoBox(`
      ${row('User', `${data.userName} (${data.userEmail})`)}
      ${row('Type', data.type)}
      ${row('Amount', `${data.currency} ${data.amount}`)}
      ${row('Reference', data.reference)}
      ${row('Transaction ID', data.id)}
      ${data.metadata ? Object.entries(data.metadata).map(([key, value]) => row(key, value)).join('') : ''}
    `)}
    ${button(`${data.frontendUrl || 'https://jaxopay.com'}/admin/transactions/${data.id}`, 'View in Admin Panel', BRAND_NAVY)}
  `),

  genericNotification: (data) => layout(`
    ${heading(data.subject)}
    ${p(`Hello ${data.name},`)}
    ${p(data.message)}
    ${data.ctaLink ? button(data.ctaLink, data.ctaText || 'View Details') : ''}
    ${divider()}
    ${p('Best regards,<br/>The JAXOPAY Team')}
  `),

  /** User: manual or Smile verification submitted (awaiting processing / review). */
  kycUserSubmissionReceived: (data) => layout(`
    ${heading('KYC submission received')}
    ${p(`Hi ${data.name},`)}
    ${p(`We have received your <strong>${data.documentLabel}</strong> verification request.`)}
    ${p(data.bodyExtra || 'Our team or verification partner will process it shortly. We will email you when there is an update.')}
    ${button(data.dashboardUrl, 'View KYC status')}
    ${divider()}
    ${p('Thank you for helping us keep JAXOPAY secure.')}
  `),

  /** User: admin reviewed a document or Smile returned a final result. */
  kycUserReviewResult: (data) => layout(`
    ${heading(data.approved ? 'KYC update: approved' : 'KYC update: not approved')}
    ${p(`Hi ${data.name},`)}
    ${data.approved
      ? `${p(`Your <strong>${data.documentLabel}</strong> verification has been <span style="color:${BRAND_GREEN};font-weight:600;">approved</span>.`)}
         ${data.newTierLabel ? p(`Your current verification level is now: <strong>${data.newTierLabel}</strong>.`) : ''}`
      : `${p(`Your <strong>${data.documentLabel}</strong> verification could not be approved at this time.`)}
         ${data.rejectionReason ? p(`<strong>Reason:</strong> ${data.rejectionReason}`) : ''}
         ${p('You can submit a new request from your KYC page if applicable.')}`}
    ${button(data.dashboardUrl, 'Open KYC')}
  `),

  /** User: self-service tier upgrade (after documents already approved). */
  kycUserTierUpgraded: (data) => layout(`
    ${heading('Verification level updated')}
    ${p(`Hi ${data.name},`)}
    ${p(`Your account verification level is now <strong>${data.newTierLabel}</strong>.`)}
    ${p('Higher limits and features may now be available based on your tier.')}
    ${button(data.dashboardUrl, 'View account')}
  `),

  /** Compliance & admin: structured KYC audit alerts. */
  kycStaffNotification: (data) => layout(`
    ${heading(data.eventTitle)}
    ${data.intro ? p(data.intro) : ''}
    ${infoBox(`${(data.rows || []).map((r) => row(r.label, r.value)).join('')}`)}
    ${data.ctaUrl ? button(data.ctaUrl, data.ctaText || 'Open admin KYC', BRAND_NAVY) : ''}
  `),

  ticketCreated: (data) => layout(`
    ${heading('Support Ticket Received')}
    ${p(`Hi ${data.name},`)}
    ${p(`We've received your support request: <strong>${data.subject}</strong>`)}
    ${p(`Your tracking ID is <span style="color:${BRAND_GREEN};font-weight:600;">#${data.id}</span>. Our team will review this and get back to you shortly.`)}
    ${button(`${data.frontendUrl}/dashboard/support`, 'View Ticket')}
    ${divider()}
    ${p('Thank you for reaching out.')}
  `),

  ticketReplied: (data) => layout(`
    ${heading('New Reply on Your Ticket')}
    ${p(`Hi ${data.name},`)}
    ${p(`Our support team has responded to your ticket: <strong>${data.subject}</strong>`)}
    ${button(`${data.frontendUrl}/dashboard/support`, 'View Reply')}
  `),

  ticketClosed: (data) => layout(`
    ${heading('Support Ticket Closed')}
    ${p(`Hi ${data.name},`)}
    ${p(`Your support ticket (<strong>${data.subject}</strong>) has been marked as closed.`)}
    ${p('We hope we were able to resolve your issue. Please let us know how we did by leaving a review!')}
    ${button(`${data.frontendUrl}/dashboard/support`, 'Rate & Review')}
  `),

  twoFactorCode: (data) => layout(`
    ${heading('Your Login Code')}
    ${p('Use the code below to complete your sign-in to JAXOPAY:')}
    <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto;">
      <tr>
        <td align="center" style="background:${SOFT};border:1px solid #e2e8f0;border-radius:10px;padding:18px 30px;font-family:'Courier New', monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:${INK};">${data.code}</td>
      </tr>
    </table>
    ${p(`This code expires shortly. If you didn't try to sign in, please secure your account immediately.`)}
  `),
};

// Aliases for backward compatibility (controllers reference kebab-case names)
templates['email-verification'] = templates.signup;
templates['password-reset'] = templates.forgotPassword;
templates['transaction-receipt'] = templates.transaction;
templates['2fa-code'] = templates.twoFactorCode;

export default templates;
