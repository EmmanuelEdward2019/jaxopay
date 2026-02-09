import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import bcrypt from 'bcryptjs';

// Get current user profile
export const getProfile = catchAsync(async (req, res) => {
  const result = await query(
    `SELECT u.id, u.email, u.phone, u.country_code, u.role, u.kyc_tier,
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

  const result = await query(
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
    [
      first_name,
      last_name,
      date_of_birth || null,
      gender,
      country,
      city,
      address,
      postal_code,
      req.user.id,
    ]
  );

  logger.info('Profile updated:', { userId: req.user.id });

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

// Delete account
export const deleteAccount = catchAsync(async (req, res) => {
  const { password } = req.body;

  // Verify password
  const userResult = await query(
    'SELECT password_hash FROM users WHERE id = $1',
    [req.user.id]
  );

  const isPasswordValid = await bcrypt.compare(
    password,
    userResult.rows[0].password_hash
  );

  if (!isPasswordValid) {
    throw new AppError('Invalid password', 401);
  }

  // Check if user has balance
  const balanceCheck = await query(
    `SELECT SUM(balance) as total_balance
     FROM wallets
     WHERE user_id = $1`,
    [req.user.id]
  );

  if (parseFloat(balanceCheck.rows[0].total_balance || 0) > 0) {
    throw new AppError(
      'Cannot delete account with remaining balance. Please withdraw all funds first.',
      400
    );
  }

  // Soft delete user
  await transaction(async (client) => {
    // Mark user as deleted
    await client.query(
      `UPDATE users
       SET deleted_at = NOW(), is_active = false, email = CONCAT(email, '_deleted_', id)
       WHERE id = $1`,
      [req.user.id]
    );

    // Mark wallets as inactive
    await client.query(
      'UPDATE wallets SET is_active = false WHERE user_id = $1',
      [req.user.id]
    );

    // Invalidate all sessions
    await client.query(
      'UPDATE user_sessions SET is_active = false WHERE user_id = $1',
      [req.user.id]
    );
  });

  logger.info('Account deleted:', { userId: req.user.id });

  res.status(200).json({
    success: true,
    message: 'Account deleted successfully',
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
    `SELECT u.id, u.email, u.phone, up.first_name, up.last_name, up.avatar_url
     FROM users u
     LEFT JOIN user_profiles up ON u.id = up.user_id
     WHERE u.id != $1
       AND u.deleted_at IS NULL
       AND u.is_active = true
       AND (
         u.email ILIKE $2
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

