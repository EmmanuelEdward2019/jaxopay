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
          id: id || reference || 'N/A',
          userName: name,
          userEmail: email,
          type,
          amount,
          currency,
          reference,
          frontendUrl: process.env.FRONTEND_URL
        }
      });
    }

    return await Promise.all([userEmailPromise, adminEmailPromise]);
  } catch (error) {
    logger.error('Failed to send transaction emails:', error);
  }
};

/**
 * Send gift card delivery email with redemption code/PIN
 */
export const sendGiftCardDelivery = async ({
  recipientEmail,
  recipientName,
  productName,
  brandName,
  amount,
  currency,
  quantity,
  totalCost,
  costCurrency,
  reference,
  transactionId,
  redeemCode,
  redeemPin,
  redeemInstructions,
  redemptionUrl,
}) => {
  try {
    const resend = getResend();
    const from = `${process.env.FROM_NAME || 'JAXOPAY'} <${process.env.FROM_EMAIL || 'noreply@jaxopay.com'}>`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; }
    .content { padding: 30px; }
    .card-box { background: #f8f9fa; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
    .code-box { background: #667eea; color: white; padding: 15px; border-radius: 6px; font-size: 24px; font-weight: bold; letter-spacing: 2px; margin: 10px 0; font-family: 'Courier New', monospace; }
    .pin-box { background: #764ba2; color: white; padding: 10px; border-radius: 6px; font-size: 18px; font-weight: bold; margin: 10px 0; font-family: 'Courier New', monospace; }
    .details { background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 15px 0; }
    .details-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e0e0e0; }
    .details-row:last-child { border-bottom: none; }
    .label { color: #666; font-weight: 500; }
    .value { color: #333; font-weight: 600; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 15px 0; font-weight: 600; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px; }
    .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; margin: 15px 0; color: #856404; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎁 Your Gift Card is Ready!</h1>
    </div>
    <div class="content">
      <p>Hi ${recipientName || 'there'},</p>
      <p>Great news! Your <strong>${brandName}</strong> gift card purchase is complete. Below are your redemption details:</p>

      <div class="card-box">
        <h3 style="margin-top:0; color:#667eea;">💳 ${productName}</h3>
        <p style="font-size:18px; color:#666;">Value: <strong>${currency} ${amount}</strong> ${quantity > 1 ? `(${quantity} cards)` : ''}</p>

        ${redeemCode ? `
        <div>
          <p style="margin:5px 0; color:#666;">Redemption Code:</p>
          <div class="code-box">${redeemCode}</div>
        </div>
        ` : ''}

        ${redeemPin ? `
        <div>
          <p style="margin:5px 0; color:#666;">PIN:</p>
          <div class="pin-box">${redeemPin}</div>
        </div>
        ` : ''}

        ${redemptionUrl ? `
        <a href="${redemptionUrl}" class="button" target="_blank">Redeem Now →</a>
        ` : ''}
      </div>

      <div class="details">
        <div class="details-row">
          <span class="label">Product</span>
          <span class="value">${productName}</span>
        </div>
        <div class="details-row">
          <span class="label">Card Value</span>
          <span class="value">${currency} ${amount} ${quantity > 1 ? `× ${quantity}` : ''}</span>
        </div>
        <div class="details-row">
          <span class="label">Total Paid</span>
          <span class="value">${costCurrency} ${totalCost}</span>
        </div>
        <div class="details-row">
          <span class="label">Reference</span>
          <span class="value">${reference}</span>
        </div>
        ${transactionId ? `
        <div class="details-row">
          <span class="label">Transaction ID</span>
          <span class="value">${transactionId}</span>
        </div>
        ` : ''}
      </div>

      ${redeemInstructions ? `
      <div class="warning">
        <strong>📝 Redemption Instructions:</strong><br>
        ${redeemInstructions}
      </div>
      ` : ''}

      <p style="margin-top:20px; color:#666; font-size:14px;">
        ⚠️ <strong>Important:</strong> Keep this email safe. The redemption code is valuable and cannot be replaced if lost.
      </p>

      <p style="margin-top:20px;">
        Questions? Visit our <a href="${process.env.FRONTEND_URL || 'https://jaxopay.com'}/support">support center</a> or reply to this email.
      </p>
    </div>
    <div class="footer">
      <p>This gift card was purchased through JAXOPAY</p>
      <p>© ${new Date().getFullYear()} JAXOPAY. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `;

    if (!resend) {
      // Development mode
      logger.info('📧 [DEV MODE] Gift Card Delivery Email:');
      logger.info(`   To: ${recipientEmail}`);
      logger.info(`   Product: ${productName}`);
      logger.info(`   Code: ${redeemCode || 'N/A'}`);
      logger.info(`   PIN: ${redeemPin || 'N/A'}`);
      logger.info(`   Reference: ${reference}`);
      return { id: 'dev-mode-gift-card', mock: true };
    }

    const response = await resend.emails.send({
      from,
      to: recipientEmail,
      subject: `🎁 Your ${brandName} Gift Card - ${currency} ${amount}`,
      html: htmlContent,
    });

    logger.info(`✅ Gift card delivery email sent to ${recipientEmail} (ID: ${response.id})`);
    return response;
  } catch (error) {
    logger.error('Failed to send gift card delivery email:', error);
    throw error;
  }
};

export default {
  sendEmail,
  sendTransactionEmails,
  sendGiftCardDelivery,
};
