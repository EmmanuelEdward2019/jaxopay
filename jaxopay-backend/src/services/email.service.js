import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';
import templates from '../utils/email-templates.js';

// Create transporter (lazy initialization to avoid crashes if nodemailer not configured)
let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    // Check if credentials are actually configured
    const isConfigured = process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_USER !== 'your-email@gmail.com';

    if (!isConfigured) {
      logger.warn('📧 Email service not configured - using development mode (emails will be logged to console)');
      return null;
    }

    try {
      transporter = nodemailer.createTransporter({
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
 * Send a single email using Nodemailer
 */
export const sendEmail = async ({ to, subject, template, data, html }) => {
  try {
    const emailTransporter = getTransporter();
    const from = `${process.env.FROM_NAME || 'JAXOPAY'} <${process.env.FROM_EMAIL || 'noreply@jaxopay.com'}>`;

    // Get HTML content from template or raw html
    const htmlContent = template && templates[template]
      ? templates[template](data)
      : (html || data?.html);

    if (!emailTransporter) {
      // Development mode
      logger.info('📧 [DEV MODE] Email would be sent:');
      logger.info(`   To: ${to}`);
      logger.info(`   Subject: ${subject}`);
      logger.info(`   Template: ${template || 'Custom HTML'}`);
      if (data?.verificationLink) logger.info(`   🔗 Link: ${data.verificationLink}`);
      if (data?.resetLink) logger.info(`   🔗 Reset: ${data.resetLink}`);
      return { messageId: 'dev-mode-id', mock: true };
    }

    const mailOptions = {
      from,
      to,
      subject,
      html: htmlContent,
    };

    const info = await emailTransporter.sendMail(mailOptions);

    logger.info('Email sent successfully:', {
      to,
      subject,
      messageId: info.messageId,
    });

    return info;
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
    const emailTransporter = getTransporter();
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
        <p style="margin: 0 0 10px 0; color: #666;">Gift Card Code:</p>
        <div class="code-box">${redeemCode}</div>
        
        ${redeemPin ? `
        <p style="margin: 15px 0 5px 0; color: #666;">Security PIN:</p>
        <div class="pin-box">${redeemPin}</div>
        ` : ''}
      </div>

      <div class="warning">
        <strong>⚠️ Keep this safe!</strong> Treat this code like cash. Do not share it with anyone unless you are gifting it to them.
      </div>

      <div class="details">
        <div class="details-row">
          <span class="label">Product</span>
          <span class="value">${productName}</span>
        </div>
        <div class="details-row">
          <span class="label">Value</span>
          <span class="value">${currency} ${amount}</span>
        </div>
        ${quantity > 1 ? `
        <div class="details-row">
          <span class="label">Quantity</span>
          <span class="value">${quantity}</span>
        </div>
        ` : ''}
        <div class="details-row">
          <span class="label">Total Paid</span>
          <span class="value">${costCurrency} ${totalCost}</span>
        </div>
        <div class="details-row">
          <span class="label">Order Ref</span>
          <span class="value">${reference}</span>
        </div>
      </div>

      ${redemptionUrl ? `
      <div style="text-align: center;">
        <a href="${redemptionUrl}" class="button">Redeem Now</a>
      </div>
      ` : ''}

      ${redeemInstructions ? `
      <div style="margin-top: 25px;">
        <h3 style="color: #333; margin-bottom: 10px;">How to Redeem:</h3>
        <div style="color: #666; font-size: 14px; line-height: 1.6;">
          ${redeemInstructions}
        </div>
      </div>
      ` : ''}
    </div>
    <div class="footer">
      <p>If you have any issues redeeming your gift card, please contact our support team with your Order Ref: ${reference}.</p>
      <p>&copy; ${new Date().getFullYear()} JAXOPAY. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `;

    if (!emailTransporter) {
      logger.info('📧 [DEV MODE] Gift Card Email would be sent:');
      logger.info(`   To: ${recipientEmail}`);
      logger.info(`   Code: ${redeemCode}`);
      return { messageId: 'dev-mode-gc-id', mock: true };
    }

    const mailOptions = {
      from,
      to: recipientEmail,
      subject: `Your ${brandName} Gift Card is here! 🎁`,
      html: htmlContent,
    };

    const info = await emailTransporter.sendMail(mailOptions);

    logger.info('Gift Card Email sent successfully:', {
      to: recipientEmail,
      reference,
      messageId: info.messageId,
    });

    return info;
  } catch (error) {
    logger.error('Gift Card Email sending failed:', {
      to: recipientEmail,
      reference,
      error: error.message,
    });
    
    // Even if email fails, we don't want to throw and crash the purchase process
    // The user can still see the code in the app dashboard
    return { error: error.message, failed: true };
  }
};

export default {
  sendEmail,
  sendTransactionEmails,
  sendGiftCardDelivery,
};
