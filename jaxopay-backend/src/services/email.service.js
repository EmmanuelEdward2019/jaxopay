import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import logger from '../utils/logger.js';
import templates from '../utils/email-templates.js';

// Lazy-initialized providers. Resend is preferred (production transport);
// nodemailer/SMTP is used as a fallback when only SMTP credentials are set.
let transporter = null;
let resendClient = null;

const isPlaceholder = (val) => !val || /your[-_]?|placeholder|change[-_]?this/i.test(String(val));

const getResend = () => {
  if (resendClient) return resendClient;
  if (isPlaceholder(process.env.RESEND_API_KEY)) return null;
  try {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  } catch (error) {
    logger.warn('Resend configuration error:', error.message);
    return null;
  }
  return resendClient;
};

const getTransporter = () => {
  if (!transporter) {
    // Check if credentials are actually configured
    const isConfigured = process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_USER !== 'your-email@gmail.com';

    if (!isConfigured) {
      return null;
    }

    try {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } catch (error) {
      logger.warn('Email service configuration error:', error.message);
      return null;
    }
  }
  return transporter;
};

/**
 * Deliver a fully-rendered email via the configured provider.
 * Order of preference: Resend → SMTP/nodemailer → dev-mode (logged, not sent).
 * Returns { delivered: false } when no provider is configured so callers can
 * fall back to dev-mode logging.
 */
const deliverEmail = async ({ from, to, subject, html }) => {
  const resend = getResend();
  if (resend) {
    const { data, error } = await resend.emails.send({ from, to, subject, html });
    if (error) {
      throw new Error(error.message || JSON.stringify(error));
    }
    return { delivered: true, messageId: data?.id, provider: 'resend' };
  }

  const emailTransporter = getTransporter();
  if (emailTransporter) {
    const info = await emailTransporter.sendMail({ from, to, subject, html });
    return { delivered: true, messageId: info.messageId, provider: 'smtp' };
  }

  return { delivered: false };
};

/**
 * Send a single email via the configured provider (Resend preferred, SMTP fallback)
 */
export const sendEmail = async ({ to, subject, template, data, html }) => {
  try {
    const from = `${process.env.FROM_NAME || 'JAXOPAY'} <${process.env.FROM_EMAIL || 'noreply@jaxopay.com'}>`;

    // Get HTML content from template or raw html
    const htmlContent = template && templates[template]
      ? templates[template](data)
      : (html || data?.html);

    const result = await deliverEmail({ from, to, subject, html: htmlContent });

    if (!result.delivered) {
      // Development mode — no email provider configured
      logger.warn('📧 [DEV MODE] Email provider not configured (set RESEND_API_KEY or SMTP_*). Email NOT sent:');
      logger.info(`   To: ${to}`);
      logger.info(`   Subject: ${subject}`);
      logger.info(`   Template: ${template || 'Custom HTML'}`);
      if (data?.verificationLink) logger.info(`   🔗 Link: ${data.verificationLink}`);
      if (data?.resetLink) logger.info(`   🔗 Reset: ${data.resetLink}`);
      return { messageId: 'dev-mode-id', mock: true };
    }

    logger.info('Email sent successfully:', {
      to,
      subject,
      messageId: result.messageId,
      provider: result.provider,
    });

    return result;
  } catch (error) {
    logger.error('Email sending failed:', {
      to,
      subject,
      error: error.message,
    });
    // Don't throw in production if it's a notification to prevent breaking the main flow
    if (process.env.NODE_ENV === 'production') {
      return { error: error.message };
    }
    throw error;
  }
};

/**
 * Send transaction notification to both user and admin
 */
export const sendTransactionEmails = async (transactionData, userData) => {
  try {
    const {
      type,
      amount,
      currency,
      reference,
      details,
      id,
      metadata
    } = transactionData;

    const { name, email } = userData;

    // 1. Send to User
    const userEmailPromise = sendEmail({
      to: email,
      subject: `Transaction Receipt: ${type} - ${currency} ${amount}`,
      template: 'transaction',
      data: {
        name,
        type,
        amount,
        currency,
        reference,
        details,
        id,
        metadata,
        date: new Date().toLocaleString()
      }
    });

    // 2. Send to Admin
    const adminEmailsRaw = process.env.ADMIN_EMAIL;
    let adminEmailPromise = Promise.resolve();

    if (adminEmailsRaw) {
      const adminEmails = adminEmailsRaw.split(',').map(e => e.trim());
      if (adminEmails.length > 0) {
        adminEmailPromise = sendEmail({
          to: adminEmails,
          subject: `[ADMIN ALERT] New ${type} Transaction: ${currency} ${amount}`,
          template: 'adminTransactionAlert',
          data: {
            id: id || reference || 'N/A',
            userName: name,
            userEmail: email,
            type,
            amount,
            currency,
            reference,
            metadata,
            frontendUrl: process.env.FRONTEND_URL
          }
        });
      }
    }

    return await Promise.all([userEmailPromise, adminEmailPromise]);
  } catch (error) {
    logger.error('Failed to send transaction emails:', error);
  }
};

/**
 * Send a withdrawal/payout notification (dedicated templates, distinct from the generic
 * transaction receipt) to both the withdrawing user and admin. Covers crypto withdrawals
 * (Obiex/Quidax) and fiat bank payouts (Korapay disbursements) alike.
 */
export const sendWithdrawalEmails = async (withdrawalData, userData) => {
  try {
    const {
      success,
      amount,
      currency,
      reference,
      txId,
      destination,
      destinationLabel,
      network,
      reason,
    } = withdrawalData;

    const { name, email } = userData;
    const template = success ? 'withdrawalSuccess' : 'withdrawalFailed';

    const userEmailPromise = sendEmail({
      to: email,
      subject: success
        ? `Withdrawal Successful: ${currency} ${amount}`
        : `Withdrawal Failed: ${currency} ${amount} (Refunded)`,
      template,
      data: {
        name, amount, currency, reference, txId, destination, destinationLabel, network, reason,
        date: new Date().toLocaleString(),
      },
    });

    const adminEmailsRaw = process.env.ADMIN_EMAIL;
    let adminEmailPromise = Promise.resolve();
    if (adminEmailsRaw) {
      const adminEmails = adminEmailsRaw.split(',').map((e) => e.trim());
      if (adminEmails.length > 0) {
        adminEmailPromise = sendEmail({
          to: adminEmails,
          subject: `[ADMIN ALERT] Withdrawal ${success ? 'Completed' : 'Failed'}: ${currency} ${amount}`,
          template: 'adminTransactionAlert',
          data: {
            id: txId || reference || 'N/A',
            userName: name,
            userEmail: email,
            type: success ? 'Withdrawal (Completed)' : 'Withdrawal (Failed — Refunded)',
            amount,
            currency,
            reference,
            metadata: destination ? { destination, ...(network ? { network } : {}) } : undefined,
            frontendUrl: process.env.FRONTEND_URL,
          },
        });
      }
    }

    return await Promise.all([userEmailPromise, adminEmailPromise]);
  } catch (error) {
    logger.error('Failed to send withdrawal emails:', error);
  }
};

export default {
  sendEmail,
  sendTransactionEmails,
  sendWithdrawalEmails,
};
