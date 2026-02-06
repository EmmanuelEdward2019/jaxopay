import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';

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

// Email templates
const templates = {
  'email-verification': (data) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Welcome to JAXOPAY, ${data.name}!</h2>
      <p>Thank you for signing up. Please verify your email address by clicking the button below:</p>
      <a href="${data.verificationLink}" style="display: inline-block; padding: 12px 24px; background-color: #6366f1; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">
        Verify Email
      </a>
      <p>Or copy and paste this link into your browser:</p>
      <p style="color: #666;">${data.verificationLink}</p>
      <p>This link will expire in 24 hours.</p>
      <p>If you didn't create an account, please ignore this email.</p>
    </div>
  `,

  '2fa-code': (data) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Your JAXOPAY Login Code</h2>
      <p>Use the code below to complete your login:</p>
      <div style="background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 20px 0;">
        ${data.code}
      </div>
      <p>This code will expire in 5 minutes.</p>
      <p>If you didn't request this code, please secure your account immediately.</p>
    </div>
  `,

  'password-reset': (data) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Reset Your Password</h2>
      <p>Hi ${data.name},</p>
      <p>You requested to reset your password. Click the button below to proceed:</p>
      <a href="${data.resetLink}" style="display: inline-block; padding: 12px 24px; background-color: #6366f1; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">
        Reset Password
      </a>
      <p>Or copy and paste this link into your browser:</p>
      <p style="color: #666;">${data.resetLink}</p>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, please ignore this email and your password will remain unchanged.</p>
    </div>
  `,

  'transaction-receipt': (data) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Transaction Receipt</h2>
      <p>Hi ${data.name},</p>
      <p>Your transaction was successful!</p>
      <div style="background-color: #f3f4f6; padding: 20px; margin: 20px 0;">
        <p><strong>Transaction ID:</strong> ${data.transactionId}</p>
        <p><strong>Amount:</strong> ${data.amount} ${data.currency}</p>
        <p><strong>Type:</strong> ${data.type}</p>
        <p><strong>Date:</strong> ${data.date}</p>
        <p><strong>Status:</strong> ${data.status}</p>
      </div>
      <p>Thank you for using JAXOPAY!</p>
    </div>
  `,
};

// Send email function
export const sendEmail = async ({ to, subject, template, data }) => {
  try {
    const emailTransporter = getTransporter();

    if (!emailTransporter) {
      // Development mode - log email details to console
      logger.info('📧 [DEV MODE] Email would be sent:');
      logger.info(`   To: ${to}`);
      logger.info(`   Subject: ${subject}`);
      if (data.verificationLink) {
        logger.info(`   🔗 Verification Link: ${data.verificationLink}`);
      }
      if (data.resetLink) {
        logger.info(`   🔗 Reset Link: ${data.resetLink}`);
      }
      if (data.code) {
        logger.info(`   🔢 Code: ${data.code}`);
      }
      return { messageId: 'dev-mode-email-logged' };
    }

    const htmlContent = templates[template] ? templates[template](data) : data.html;

    const mailOptions = {
      from: `${process.env.FROM_NAME || 'JAXOPAY'} <${process.env.FROM_EMAIL}>`,
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
    throw error;
  }
};

export default {
  sendEmail,
};

