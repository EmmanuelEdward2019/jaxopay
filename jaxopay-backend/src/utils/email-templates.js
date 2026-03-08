/**
 * Email Templates for JAXOPAY
 */

const baseStyles = `
  body { font-family: 'Inter', -apple-system, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
  .header { text-align: center; margin-bottom: 40px; }
  .logo { font-size: 24px; font-weight: bold; color: #10b981; text-decoration: none; }
  .content { background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
  .footer { text-align: center; margin-top: 40px; font-size: 14px; color: #6b7280; }
  .button { display: inline-block; padding: 14px 28px; background-color: #10b981; color: white !important; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 24px 0; }
  .highlight { color: #10b981; font-weight: 600; }
  .transaction-box { background: #f9fafb; border-radius: 8px; padding: 24px; margin: 24px 0; border: 1px solid #f3f4f6; }
  .transaction-row { display: flex; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px solid #f3f4f6; padding-bottom: 8px; }
  .transaction-label { color: #6b7280; font-size: 14px; }
  .transaction-value { color: #111827; font-weight: 500; text-align: right; }
  .divider { height: 1px; background: #e5e7eb; margin: 32px 0; }
`;

const layout = (content) => `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>${baseStyles}</style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <a href="#" class="logo">JAXOPAY</a>
        </div>
        <div class="content">
          ${content}
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} JAXOPAY. All rights reserved.</p>
          <p>This is an automated message, please do not reply.</p>
        </div>
      </div>
    </body>
  </html>
`;

export const templates = {
  signup: (data) => layout(`
    <h1 style="margin-top: 0;">Welcome to JAXOPAY! 🚀</h1>
    <p>Hi ${data.name},</p>
    <p>We're excited to have you join our global fintech community. To get started, please confirm your email address.</p>
    <div style="text-align: center;">
      <a href="${data.verificationLink}" class="button">Verify Email Address</a>
    </div>
    <p>If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="word-break: break-all; font-size: 14px; color: #6b7280;">${data.verificationLink}</p>
    <div class="divider"></div>
    <p>Need help? Our support team is always here for you.</p>
  `),

  forgotPassword: (data) => layout(`
    <h1 style="margin-top: 0;">Reset Your Password</h1>
    <p>Hi ${data.name},</p>
    <p>You recently requested to reset your password for your JAXOPAY account. Click the button below to set a new password:</p>
    <div style="text-align: center;">
      <a href="${data.resetLink}" class="button">Reset Password</a>
    </div>
    <p>This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.</p>
    <div class="divider"></div>
    <p>For your security, never share this link with anyone.</p>
  `),

  transaction: (data) => layout(`
    <h1 style="margin-top: 0;">Transaction Notification</h1>
    <p>Hello ${data.name},</p>
    <p>Your recent <span class="highlight">${data.type}</span> transaction has been processed successfully.</p>
    
    <div class="transaction-box">
      <div class="transaction-row">
        <span class="transaction-label">Reference</span>
        <span class="transaction-value">${data.reference}</span>
      </div>
      <div class="transaction-row">
        <span class="transaction-label">Amount</span>
        <span class="transaction-value">${data.currency} ${data.amount}</span>
      </div>
      <div class="transaction-row">
        <span class="transaction-label">Status</span>
        <span class="transaction-value" style="color: #10b981;">Completed</span>
      </div>
      <div class="transaction-row">
        <span class="transaction-label">Date</span>
        <span class="transaction-value">${data.date || new Date().toLocaleString()}</span>
      </div>
      ${data.details ? `
        <div style="margin-top: 16px; font-size: 14px; color: #4b5563;">
          <strong>Details:</strong><br/>
          ${data.details}
        </div>
      ` : ''}
    </div>

    <p>Thank you for choosing JAXOPAY for your global transactions.</p>
  `),

  adminTransactionAlert: (data) => layout(`
    <h1 style="margin-top: 0; color: #111827;">System Alert: New Transaction</h1>
    <p>An important transaction has occurred on the platform:</p>
    
    <div class="transaction-box">
      <div class="transaction-row">
        <span class="transaction-label">User</span>
        <span class="transaction-value">${data.userName} (${data.userEmail})</span>
      </div>
      <div class="transaction-row">
        <span class="transaction-label">Type</span>
        <span class="transaction-value">${data.type}</span>
      </div>
      <div class="transaction-row">
        <span class="transaction-label">Amount</span>
        <span class="transaction-value">${data.currency} ${data.amount}</span>
      </div>
      <div class="transaction-row">
        <span class="transaction-label">Reference</span>
        <span class="transaction-value">${data.reference}</span>
      </div>
    </div>

    <div style="text-align: center;">
      <a href="${data.frontendUrl || 'http://localhost:5173'}/admin/transactions/${data.id}" class="button" style="background-color: #111827;">View in Admin Panel</a>
    </div>
  `),

  genericNotification: (data) => layout(`
    <h1 style="margin-top: 0;">${data.subject}</h1>
    <p>Hello ${data.name},</p>
    <p>${data.message}</p>
    ${data.ctaLink ? `
      <div style="text-align: center;">
        <a href="${data.ctaLink}" class="button">${data.ctaText || 'View Details'}</a>
      </div>
    ` : ''}
    <div class="divider"></div>
    <p>Best regards,<br/>The JAXOPAY Team</p>
  `)
};

// Aliases for backward compatibility
templates['email-verification'] = templates.signup;
templates['password-reset'] = templates.forgotPassword;
templates['transaction-receipt'] = templates.transaction;

export default templates;
