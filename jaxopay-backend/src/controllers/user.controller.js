import crypto from 'crypto';
import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import bcrypt from 'bcryptjs';
import { auditFromReq } from '../services/audit.service.js';

// Get current user profile
export const getProfile = catchAsync(async (req, res) => {
  const result = await query(
    `SELECT u.id, u.email, u.username, u.phone, u.country_code, u.role, u.kyc_tier,
            u.is_email_verified, u.is_phone_verified, u.two_fa_enabled,
            u.is_active, u.created_at, u.preferred_language, u.preferences,
            up.first_name, up.last_name, up.date_of_birth, up.gender,
            up.country, up.city, up.address_line1 as address, up.postal_code,
            up.avatar_url
     FROM users u
     LEFT JOIN user_profiles up ON u.id = up.user_id
     WHERE u.id = $1`,
    [req.user.id]
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  res.status(200).json({
    success: true,
    data: {
      user: result.rows[0]
    },
  });
});

// Update user settings (Language, Notifications, etc)
export const updateSettings = catchAsync(async (req, res) => {
  const { language, notifications, show_balances } = req.body;

  // Build preferences object
  // First get existing preferences to merge? Or just overwrite?
  // Let's merge if possible, but simplest is to just update what's passed.
  // We'll fetch current first to be safe.
  const current = await query('SELECT preferences FROM users WHERE id = $1', [req.user.id]);
  const currentPrefs = current.rows[0].preferences || {};

  const newPrefs = {
    ...currentPrefs,
    ...(notifications && { notifications }),
    ...(show_balances !== undefined && { show_balances })
  };

  const result = await query(
    `UPDATE users
     SET preferred_language = COALESCE($1, preferred_language),
         preferences = $2,
         updated_at = NOW()
     WHERE id = $3
     RETURNING preferred_language, preferences`,
    [language, newPrefs, req.user.id]
  );

  res.status(200).json({
    success: true,
    message: 'Settings updated successfully',
    data: result.rows[0],
  });
});

// Update user profile
export const updateProfile = catchAsync(async (req, res) => {
  const {
    first_name,
    last_name,
    date_of_birth,
    gender,
    country,
    city,
    address,
    postal_code,
  } = req.body;

  // Empty strings → null so COALESCE preserves existing values instead of blanking them.
  const nz = (v) => (v === '' || v === undefined ? null : v);
  // country is stored as a 2-letter ISO code (varchar(2)) — guard against overflow.
  const country2 = nz(country) ? String(country).trim().toUpperCase().slice(0, 2) : null;
  const params = [
    nz(first_name), nz(last_name), nz(date_of_birth), nz(gender),
    country2, nz(city), nz(address), nz(postal_code), req.user.id,
  ];

  let result = await query(
    `UPDATE user_profiles
     SET first_name = COALESCE($1, first_name),
         last_name = COALESCE($2, last_name),
         date_of_birth = COALESCE($3, date_of_birth),
         gender = COALESCE($4, gender),
         country = COALESCE($5, country),
         city = COALESCE($6, city),
         address_line1 = COALESCE($7, address_line1),
         postal_code = COALESCE($8, postal_code),
         updated_at = NOW()
     WHERE user_id = $9
     RETURNING *`,
    params
  );

  // No profile row yet (older accounts) → create one.
  if (result.rows.length === 0) {
    result = await query(
      `INSERT INTO user_profiles (user_id, first_name, last_name, date_of_birth, gender, country, city, address_line1, postal_code)
       VALUES ($9, $1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      params
    );
  }

  logger.info('Profile updated:', { userId: req.user.id });
  auditFromReq(req, { action: 'profile_updated', entityType: 'user_profile', entityId: req.user.id });

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: result.rows[0],
  });
});

// Update avatar
export const updateAvatar = catchAsync(async (req, res) => {
  const { avatar_url } = req.body;

  if (!avatar_url) {
    throw new AppError('Avatar URL is required', 400);
  }

  const result = await query(
    `UPDATE user_profiles
     SET avatar_url = $1, updated_at = NOW()
     WHERE user_id = $2
     RETURNING avatar_url`,
    [avatar_url, req.user.id]
  );

  logger.info('Avatar updated:', { userId: req.user.id });

  res.status(200).json({
    success: true,
    message: 'Avatar updated successfully',
    data: result.rows[0],
  });
});

// Update phone number
export const updatePhone = catchAsync(async (req, res) => {
  const { phone, country_code } = req.body;

  // Check if phone is already in use
  const existing = await query(
    'SELECT id FROM users WHERE phone = $1 AND id != $2',
    [phone, req.user.id]
  );

  if (existing.rows.length > 0) {
    throw new AppError('Phone number is already in use', 409);
  }

  const result = await query(
    `UPDATE users
     SET phone = $1, country_code = $2, is_phone_verified = false, updated_at = NOW()
     WHERE id = $3
     RETURNING phone, country_code, is_phone_verified`,
    [phone, country_code, req.user.id]
  );

  logger.info('Phone updated:', { userId: req.user.id, phone });

  res.status(200).json({
    success: true,
    message: 'Phone number updated. Please verify your new phone number.',
    data: result.rows[0],
  });
});

// Update email
export const updateEmail = catchAsync(async (req, res) => {
  const { email } = req.body;

  // Check if email is already in use
  const existing = await query(
    'SELECT id FROM users WHERE email = $1 AND id != $2',
    [email, req.user.id]
  );

  if (existing.rows.length > 0) {
    throw new AppError('Email is already in use', 409);
  }

  const result = await query(
    `UPDATE users
     SET email = $1, is_email_verified = false, updated_at = NOW()
     WHERE id = $2
     RETURNING email, is_email_verified`,
    [email, req.user.id]
  );

  logger.info('Email updated:', { userId: req.user.id, email });

  res.status(200).json({
    success: true,
    message: 'Email updated. Please verify your new email address.',
    data: result.rows[0],
  });
});

// Get user statistics
export const getUserStats = catchAsync(async (req, res) => {
  // Get wallet balances
  const wallets = await query(
    `SELECT currency, SUM(balance) as balance
     FROM wallets
     WHERE user_id = $1
     GROUP BY currency`,
    [req.user.id]
  );

  // Get transaction count
  const txCount = await query(
    `SELECT COUNT(*) as total_transactions
     FROM transactions
     WHERE user_id = $1`,
    [req.user.id]
  );

  // Get recent activity count (last 30 days)
  const recentActivity = await query(
    `SELECT COUNT(*) as recent_transactions
     FROM transactions
     WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
    [req.user.id]
  );

  // Get card count
  const cardCount = await query(
    `SELECT COUNT(*) as total_cards
     FROM virtual_cards
     WHERE user_id = $1`,
    [req.user.id]
  );

  // Get wallet count
  const walletCount = await query(
    'SELECT COUNT(*) as total_wallets FROM wallets WHERE user_id = $1',
    [req.user.id]
  );

  res.status(200).json({
    success: true,
    data: {
      wallet_count: parseInt(walletCount.rows[0].total_wallets),
      card_count: parseInt(cardCount.rows[0].total_cards),
      transaction_count: parseInt(txCount.rows[0].total_transactions),
      recent_transactions: parseInt(recentActivity.rows[0].recent_transactions),
      kyc_tier: req.user.kyc_tier,
      account_age_days: Math.floor(
        (new Date() - new Date(req.user.created_at)) / (1000 * 60 * 60 * 24)
      ),
    },
  });
});

// Get user activity log
export const getActivityLog = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  const result = await query(
    `SELECT id, action as activity_type, action as description, ip_address, user_agent, created_at
     FROM audit_logs
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [req.user.id, limit, offset]
  );

  const countResult = await query(
    'SELECT COUNT(*) as total FROM audit_logs WHERE user_id = $1',
    [req.user.id]
  );

  res.status(200).json({
    success: true,
    data: {
      logs: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit),
      },
    },
  });
});

// Shared: performs the actual account erasure. Only called after a super_admin approves a
// pending account_deletion_requests row (see admin.controller.js) — never directly from a user
// action, so deletion always goes through review first.
//
// This is a PII anonymization, not a row deletion: financial/AML-relevant records (transactions,
// fx_transactions, wallet_transactions, bill_payments, card_transactions, crypto_exchanges,
// digital_transactions, gift_card_purchases/sales, aml_risk_scores, sanctions_screening,
// audit_logs, virtual_bank_accounts) are retained for compliance recordkeeping, deactivated
// where applicable but never redacted or deleted. Everything else that identifies the person
// (profile, KYC document images/numbers, card PANs, session/device/OTP tokens, saved
// beneficiaries, notifications) is erased or replaced with placeholders.
export async function performAccountDeletion(userId) {
  const balanceCheck = await query(
    `SELECT SUM(balance) as total_balance FROM wallets WHERE user_id = $1`,
    [userId]
  );

  if (parseFloat(balanceCheck.rows[0].total_balance || 0) > 0) {
    throw new AppError(
      'Cannot delete this account — it still has a wallet balance. Ask the user to withdraw all funds first.',
      400
    );
  }

  // password_hash is NOT NULL on users — can't blank it, so overwrite it with a random, unusable
  // bcrypt hash instead (same effect: nobody can ever log in with it, but it satisfies the
  // constraint). This previously set it to NULL, which threw a "not-null constraint" error and
  // rolled back the ENTIRE deletion — every approval attempt failed with a generic error because
  // of this single line.
  const unusablePasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

  await transaction(async (client) => {
    // Core identity + credentials — mangle email/username so the address can never be
    // re-derived or logged in with again, wipe every secret/auth field.
    await client.query(
      `UPDATE users
       SET deleted_at = NOW(),
           is_active = false,
           email = CONCAT(email, '_deleted_', id),
           username = NULL,
           phone = NULL,
           password_hash = $2,
           two_fa_secret = NULL,
           two_fa_enabled = false,
           transaction_pin = NULL,
           transaction_pin_set_at = NULL,
           transaction_pin_failed_attempts = 0,
           transaction_pin_locked_until = NULL,
           quidax_user_id = NULL,
           quidax_user_sn = NULL
       WHERE id = $1`,
      [userId, unusablePasswordHash]
    );

    // Profile PII — replaced with a placeholder rather than left NULL so any admin UI that
    // renders a name doesn't just show blank.
    await client.query(
      `UPDATE user_profiles
       SET first_name = 'Deleted',
           last_name = 'User',
           middle_name = NULL,
           date_of_birth = NULL,
           gender = NULL,
           address_line1 = NULL,
           address_line2 = NULL,
           city = NULL,
           state = NULL,
           postal_code = NULL,
           avatar_url = NULL
       WHERE user_id = $1`,
      [userId]
    );

    // KYC documents — keep the review trail (status/tier/reviewed_by/rejection_reason) for
    // compliance, erase the actual ID number and document/selfie images. document_url is
    // NOT NULL, so it gets a placeholder rather than NULL (same class of bug as password_hash
    // above — this one would only surface for a user who actually had KYC documents on file).
    await client.query(
      `UPDATE kyc_documents
       SET document_number = NULL, document_url = 'REDACTED', selfie_url = NULL
       WHERE user_id = $1`,
      [userId]
    );

    // Virtual cards — several columns are NOT NULL, so overwrite with placeholders instead of
    // nulling. Force-terminate any card that wasn't already.
    await client.query(
      `UPDATE virtual_cards
       SET card_number_encrypted = 'REDACTED',
           card_last_four = '0000',
           cvv_encrypted = 'REDACTED',
           cardholder_name = 'DELETED USER',
           expiry_month = 1,
           expiry_year = 2000,
           status = 'terminated',
           terminated_at = COALESCE(terminated_at, NOW())
       WHERE user_id = $1`,
      [userId]
    );

    // Virtual bank accounts are deactivated but the account number/bank details are kept —
    // the issuing banking partner may need to trace a stray inbound wire to this account after
    // closure, so this is treated like the rest of the financial trail, not PII to erase.
    await client.query('UPDATE virtual_bank_accounts SET is_active = false WHERE user_id = $1', [userId]);

    await client.query('UPDATE wallets SET is_active = false WHERE user_id = $1', [userId]);

    // Pure security/session artifacts — no compliance reason to retain any of these.
    await client.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM user_devices WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM email_verifications WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM password_resets WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM otp_codes WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM totp_secrets WHERE user_id = $1', [userId]);

    // Saved recipients hold third-party PII (other people's bank/crypto details) with no
    // compliance need to retain once the account is closed.
    await client.query('DELETE FROM beneficiaries WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM saved_beneficiaries WHERE user_id = $1', [userId]);

    // User-owned notification content/settings — not part of the financial record.
    await client.query('DELETE FROM notifications WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM notification_preferences WHERE user_id = $1', [userId]);
  });

  logger.info('Account deleted (approved) — PII erased, financial/AML records retained:', { userId });
}

// Request account deletion — does NOT delete anything immediately. Creates a pending request
// that a super_admin must approve (or reject) from the admin panel.
export const requestAccountDeletion = catchAsync(async (req, res) => {
  const { password, reason } = req.body;

  const userResult = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  const isPasswordValid = await bcrypt.compare(password, userResult.rows[0].password_hash);
  if (!isPasswordValid) {
    throw new AppError('Invalid password', 401);
  }

  const existing = await query(
    `SELECT id, status, requested_at FROM account_deletion_requests WHERE user_id = $1 AND status = 'pending'`,
    [req.user.id]
  );
  if (existing.rows.length > 0) {
    return res.status(200).json({
      success: true,
      message: 'You already have a pending account deletion request awaiting review.',
      data: existing.rows[0],
    });
  }

  const result = await query(
    `INSERT INTO account_deletion_requests (user_id, reason, status)
     VALUES ($1, $2, 'pending')
     RETURNING id, status, requested_at`,
    [req.user.id, reason || null]
  );

  logger.info('Account deletion requested:', { userId: req.user.id, requestId: result.rows[0].id });

  res.status(201).json({
    success: true,
    message: 'Your account deletion request has been submitted and is awaiting super admin approval.',
    data: result.rows[0],
  });
});

// GET /users/account/deletion-status — does the caller have a pending/reviewed request?
export const getMyAccountDeletionStatus = catchAsync(async (req, res) => {
  const result = await query(
    `SELECT id, status, reason, requested_at, reviewed_at, admin_note
     FROM account_deletion_requests WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [req.user.id]
  );
  res.status(200).json({
    success: true,
    data: result.rows[0] || null,
  });
});

// Get user by ID (for transfers, etc.)
export const getUserById = catchAsync(async (req, res) => {
  const { userId } = req.params;

  const result = await query(
    `SELECT u.id, up.first_name, up.last_name, up.avatar_url
     FROM users u
     LEFT JOIN user_profiles up ON u.id = up.user_id
     WHERE u.id = $1 AND u.deleted_at IS NULL AND u.is_active = true`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  res.status(200).json({
    success: true,
    data: result.rows[0],
  });
});

// Search users (for transfers)
export const searchUsers = catchAsync(async (req, res) => {
  const { query: searchQuery } = req.query;

  if (!searchQuery || searchQuery.length < 3) {
    throw new AppError('Search query must be at least 3 characters', 400);
  }

  const result = await query(
    `SELECT u.id, u.email, u.username, u.phone, up.first_name, up.last_name, up.avatar_url
     FROM users u
     LEFT JOIN user_profiles up ON u.id = up.user_id
     WHERE u.id != $1
       AND u.deleted_at IS NULL
       AND u.is_active = true
       AND (
         u.email ILIKE $2
         OR u.username ILIKE $2
         OR u.phone ILIKE $2
         OR up.first_name ILIKE $2
         OR up.last_name ILIKE $2
       )
     LIMIT 10`,
    [req.user.id, `%${searchQuery}%`]
  );

  res.status(200).json({
    success: true,
    data: result.rows,
  });
});

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

// GET /users/username/check?username=... — availability check (case-insensitive)
export const checkUsernameAvailability = catchAsync(async (req, res) => {
  const raw = String(req.query.username || '').trim();
  if (!USERNAME_PATTERN.test(raw)) {
    return res.status(200).json({
      success: true,
      data: { available: false, reason: '3-20 characters: letters, numbers, and underscores only.' },
    });
  }
  const existing = await query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [raw]);
  res.status(200).json({ success: true, data: { available: existing.rows.length === 0 } });
});

// PATCH /users/username — set or change the caller's own username
export const setUsername = catchAsync(async (req, res) => {
  const raw = String(req.body.username || '').trim();
  if (!USERNAME_PATTERN.test(raw)) {
    throw new AppError('Username must be 3-20 characters: letters, numbers, and underscores only.', 400);
  }
  const existing = await query(
    'SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2',
    [raw, req.user.id]
  );
  if (existing.rows.length > 0) {
    throw new AppError('That username is already taken.', 409);
  }
  await query('UPDATE users SET username = $1, updated_at = NOW() WHERE id = $2', [raw, req.user.id]);
  res.status(200).json({ success: true, message: 'Username updated.', data: { username: raw } });
});

