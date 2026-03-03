import { Resend } from 'resend';
import logger from '../utils/logger.js';
import templates from '../utils/email-templates.js';

// Initialize Resend with lazy loading
let resendInstance = null;

const getResend = () => {
  if (!resendInstance) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || apiKey === '') {
      logger.warn('📧 Resend API Key not found. Email service will run in development mode (logged to console).');
      return null;
    }
    resendInstance = new Resend(apiKey);
  }
  return resendInstance;
};

/**
 * Send a single email using Resend
 */
export const sendEmail = async ({ to, subject, template, data, html }) => {
  try {
    const resend = getResend();
    const from = `${process.env.FROM_NAME || 'JAXOPAY'} <${process.env.FROM_EMAIL || 'noreply@jaxopay.com'}>`;

    // Get HTML content from template or raw html
    const htmlContent = template && templates[template]
      ? templates[template](data)
      : (html || data?.html);

    if (!resend) {
      // Development mode
      logger.info('📧 [DEV MODE] Email would be sent:');
      logger.info(`   To: ${to}`);
      logger.info(`   Subject: ${subject}`);
      logger.info(`   Template: ${template || 'Custom HTML'}`);
      if (data?.verificationLink) logger.info(`   🔗 Link: ${data.verificationLink}`);
      if (data?.resetLink) logger.info(`   🔗 Reset: ${data.resetLink}`);
      return { id: 'dev-mode-id', mock: true };
    }

    const response = await resend.emails.send({
      from,
      to,
      subject,
      html: htmlContent,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    logger.info('Email sent successfully:', {
      to,
      subject,
      id: response.data.id,
    });

    return response.data;
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
      id
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
        date: new Date().toLocaleString()
      }
    });

    // 2. Send to Admin
    const adminEmailsRaw = process.env.ADMIN_EMAIL;
    let adminEmailPromise = Promise.resolve();

    if (adminEmailsRaw) {
      // Split by comma and trim whitespace to support multiple emails
      const adminEmails = adminEmailsRaw.split(',').map(email => email.trim());

      adminEmailPromise = sendEmail({
        to: adminEmails,
        subject: `[ADMIN ALERT] New ${type} Transaction: ${currency} ${amount}`,
        template: 'adminTransactionAlert',
        data: {
          id,
          userName: name,
          userEmail: email,
          type,
          amount,
          currency,
          reference
        }
      });
    }

    return await Promise.all([userEmailPromise, adminEmailPromise]);
  } catch (error) {
    logger.error('Failed to send transaction emails:', error);
  }
};

export default {
  sendEmail,
  sendTransactionEmails,
};
