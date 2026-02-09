import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import { sendSMS } from '../services/sms.service.js';
import bcrypt from 'bcryptjs';
import { providerRegistry } from '../orchestration/index.js';

// Get all users (admin only)
export const getUsers = catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    search,
    kyc_tier,
    status,
    role,
  } = req.query;
  const offset = (page - 1) * limit;

  let conditions = 'WHERE 1=1';
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    conditions += ` AND (u.email ILIKE $${params.length} OR up.first_name ILIKE $${params.length} OR up.last_name ILIKE $${params.length})`;
  }

  if (kyc_tier) {
    const tierMap = {
      '0': 'tier_0',
      '1': 'tier_1',
      '2': 'tier_2'
    };
    params.push(tierMap[kyc_tier] || kyc_tier);
    conditions += ` AND u.kyc_tier = $${params.length}::kyc_tier`;
  }

  if (status) {
    params.push(status === 'active');
    conditions += ` AND u.is_active = $${params.length}`;
  }

  if (role) {
    params.push(role);
    conditions += ` AND u.role = $${params.length}`;
  }

  const result = await query(
    `SELECT u.id, u.email, u.phone, u.role, u.kyc_tier, u.is_active,
            u.is_email_verified, u.two_fa_enabled, u.created_at,
            up.first_name, up.last_name, up.country, up.avatar_url
     FROM users u
     LEFT JOIN user_profiles up ON u.id = up.user_id
     ${conditions}
     ORDER BY u.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) as total FROM users u
     LEFT JOIN user_profiles up ON u.id = up.user_id
     ${conditions}`,
    params
  );

  res.status(200).json({
    success: true,
    data: {
      users: result.rows.map(u => ({
        ...u,
        status: u.is_active ? 'active' : 'suspended'
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit),
      },
    },
  });
});

// Create new user (admin only)
export const createUser = catchAsync(async (req, res) => {
  const { email, password, phone, first_name, last_name, role = 'end_user', kyc_tier = 'tier_0' } = req.body;

  // Check if user already exists
  const existing = await query('SELECT id FROM users WHERE email = $1 OR phone = $2', [email, phone]);
  if (existing.rows.length > 0) {
    throw new AppError('User with this email or phone already exists', 400);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const result = await transaction(async (client) => {
    // 1. Create User
    const userRes = await client.query(
      `INSERT INTO users (email, phone, password_hash, role, kyc_tier, is_email_verified)
       VALUES ($1, $2, $3, $4, $5::kyc_tier, true)
       RETURNING id, email, phone, role, kyc_tier, created_at`,
      [email, phone, passwordHash, role, kyc_tier]
    );

    const user = userRes.rows[0];

    // 2. Create Profile
    await client.query(
      `INSERT INTO user_profiles (user_id, first_name, last_name)
       VALUES ($1, $2, $3)`,
      [user.id, first_name, last_name]
    );

    // 3. Create Wallets (USD, NGN)
    const currencies = ['USD', 'NGN'];
    for (const cur of currencies) {
      await client.query(
        `INSERT INTO wallets (user_id, currency, wallet_type, balance)
         VALUES ($1, $2, 'fiat', 0)`,
        [user.id, cur]
      );
    }

    return user;
  });

  // Log action
  await logAdminAction({
    adminId: req.user.id,
    action: 'create_user',
    targetId: result.id,
    targetType: 'user',
    changes: { email, role, kyc_tier },
    req
  });

  res.status(201).json({
    success: true,
    message: 'User created successfully',
    data: result
  });
});

// Get single user (admin only)
export const getUser = catchAsync(async (req, res) => {
  const { userId } = req.params;

  const result = await query(
    `SELECT u.id, u.email, u.phone, u.role, u.kyc_tier, u.is_active,
            u.is_email_verified, u.two_fa_enabled, u.created_at, u.updated_at,
            up.first_name, up.last_name, up.date_of_birth, up.gender,
            up.country, up.city, up.address, up.postal_code, up.avatar_url
     FROM users u
     LEFT JOIN user_profiles up ON u.id = up.user_id
     WHERE u.id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  // Get user wallets
  const wallets = await query(
    `SELECT id, currency, wallet_type, balance, status
     FROM wallets
     WHERE user_id = $1`,
    [userId]
  );

  // Get KYC documents
  const kycDocs = await query(
    `SELECT id, document_type, status, submitted_at, reviewed_at
     FROM kyc_documents
     WHERE user_id = $1
     ORDER BY submitted_at DESC`,
    [userId]
  );

  const user = {
    ...result.rows[0],
    status: result.rows[0].is_active ? 'active' : 'suspended'
  };

  res.status(200).json({
    success: true,
    data: {
      user,
      wallets: wallets.rows,
      kyc: kycDocs.rows[0] || null, // Assuming kycDocs is meant to be 'kyc' and we take the first one
      activity: [], // Placeholder as 'activity' query is not provided
    },
  });
});

// Update user (admin only)
export const updateUser = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { kyc_tier, status, role } = req.body;

  const updates = [];
  const params = [userId];

  if (kyc_tier !== undefined) {
    const tierMap = {
      0: 'tier_0',
      1: 'tier_1',
      2: 'tier_2'
    };
    params.push(tierMap[kyc_tier] || kyc_tier);
    updates.push(`kyc_tier = $${params.length}::kyc_tier`);
  }

  if (status !== undefined) {
    params.push(status === 'active');
    updates.push(`is_active = $${params.length}`);
  }

  if (role) {
    params.push(role);
    updates.push(`role = $${params.length}`);
  }

  if (updates.length === 0) {
    throw new AppError('No fields to update', 400);
  }

  const result = await query(
    `UPDATE users
     SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $1
     RETURNING id, email, role, kyc_tier, is_active`,
    params
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  logger.info('User updated by admin:', {
    adminId: req.user.id,
    userId,
    updates: { kyc_tier, status, role },
  });

  // Log the update action
  await logAdminAction({
    adminId: req.user.id,
    action: 'update_user',
    targetId: userId,
    targetType: 'user',
    changes: { kyc_tier, status, role },
    req
  });

  res.status(200).json({
    success: true,
    message: 'User updated successfully',
    data: result.rows[0],
  });
});

// Suspend user (admin only)
export const suspendUser = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { reason } = req.body;

  const result = await query(
    `UPDATE users
     SET is_active = false, updated_at = NOW()
     WHERE id = $1
     RETURNING id, email, is_active`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  logger.warn('User suspended by admin:', {
    adminId: req.user.id,
    userId,
    reason,
  });

  // Log suspension
  await logAdminAction({
    adminId: req.user.id,
    action: 'suspend_user',
    targetId: userId,
    targetType: 'user',
    changes: { reason },
    req
  });

  res.status(200).json({
    success: true,
    message: 'User suspended successfully',
    data: result.rows[0],
  });
});

// Verify KYC document (admin only)
export const verifyKYCDocument = catchAsync(async (req, res) => {
  const { documentId } = req.params;
  const { status, rejection_reason } = req.body;

  const result = await transaction(async (client) => {
    // Update document status
    const doc = await client.query(
      `UPDATE kyc_documents
       SET status = $1,
           rejection_reason = $2,
           reviewed_at = NOW(),
           reviewed_by = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, user_id, document_type, status`,
      [status, rejection_reason || null, req.user.id, documentId]
    );

    if (doc.rows.length === 0) {
      throw new AppError('Document not found', 404);
    }

    // If approved, check if user should be upgraded to next tier
    if (status === 'approved') {
      const userDocs = await client.query(
        `SELECT COUNT(*) as approved_count
         FROM kyc_documents
         WHERE user_id = $1 AND status = 'approved'`,
        [doc.rows[0].user_id]
      );

      const approvedCount = parseInt(userDocs.rows[0].approved_count);
      let newTier = 'tier_0';

      if (approvedCount === 1) newTier = 'tier_1';
      if (approvedCount >= 2) newTier = 'tier_2';

      // Update user KYC tier
      await client.query(
        `UPDATE users SET kyc_tier = $1, updated_at = NOW() WHERE id = $2`,
        [newTier, doc.rows[0].user_id]
      );
    }

    // Log KYC verification
    await logAdminAction({
      adminId: req.user.id,
      action: 'verify_kyc',
      targetId: documentId,
      targetType: 'kyc_document',
      changes: { status, rejection_reason },
      req
    });

    return doc.rows[0];
  });

  logger.info('KYC document verified by admin:', {
    adminId: req.user.id,
    documentId,
    status,
  });

  res.status(200).json({
    success: true,
    message: 'KYC document verified successfully',
    data: result,
  });
});

// Get system statistics (admin only)
export const getSystemStats = catchAsync(async (req, res) => {
  // Total users
  const totalUsers = await query('SELECT COUNT(*) as count FROM users');

  // Active vs Suspended users
  const userStats = await query(
    `SELECT 
      COUNT(*) FILTER (WHERE is_active = true) as active,
      COUNT(*) FILTER (WHERE is_active = false) as suspended
     FROM users`
  );

  // Total wallets
  const totalWallets = await query('SELECT COUNT(*) as count FROM wallets');

  // Total transactions
  const totalTransactions = await query(
    'SELECT COUNT(*) as count FROM transactions'
  );

  // Transaction volume (last 30 days) - Summing up everything converted to USD for simplicity in overview
  // In a real scenario, you'd use the stored exchange_rate or join with exchange_rates table
  const transactionVolume = await query(
    `SELECT SUM(from_amount) as total_volume
     FROM transactions
     WHERE created_at >= NOW() - INTERVAL '30 days'
       AND status = 'completed'`
  );

  const pendingKYC = await query(
    `SELECT COUNT(*) as count
     FROM kyc_documents
     WHERE status = 'pending'`
  );

  // Active virtual cards
  const activeCards = await query(
    `SELECT COUNT(*) as count
     FROM virtual_cards
     WHERE status = 'active'`
  );

  res.status(200).json({
    success: true,
    data: {
      total_users: parseInt(totalUsers.rows[0].count),
      active_users: parseInt(userStats.rows[0].active),
      suspended_users: parseInt(userStats.rows[0].suspended),
      total_wallets: parseInt(totalWallets.rows[0].count),
      total_transactions: parseInt(totalTransactions.rows[0].count),
      total_volume: parseFloat(transactionVolume.rows[0].total_volume || 0),
      pending_kyc: parseInt(pendingKYC.rows[0].count),
      total_cards: parseInt(activeCards.rows[0].count),
    },
  });

  logger.info('System Stats Fetched:', {
    users: totalUsers.rows[0].count,
    wallets: totalWallets.rows[0].count,
    transactions: totalTransactions.rows[0].count,
    active_cards: activeCards.rows[0].count
  });
});

// Get pending KYC documents (admin only)
export const getPendingKYC = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  const result = await query(
    `SELECT kd.id, kd.user_id, kd.document_type, kd.document_number,
            kd.status, kd.submitted_at,
            u.email, up.first_name, up.last_name
     FROM kyc_documents kd
     JOIN users u ON kd.user_id = u.id
     LEFT JOIN user_profiles up ON u.id = up.user_id
     WHERE kd.status = 'pending'
     ORDER BY kd.submitted_at ASC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) as total
     FROM kyc_documents
     WHERE status = 'pending'`
  );

  res.status(200).json({
    success: true,
    data: {
      documents: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit),
      },
    },
  });
});


// Get all feature toggles (admin only)
export const getFeatureToggles = catchAsync(async (req, res) => {
  const result = await query(
    'SELECT id, feature_name, is_enabled, enabled_countries, disabled_countries, config, updated_at FROM feature_toggles ORDER BY feature_name ASC'
  );

  res.status(200).json({
    success: true,
    data: result.rows,
  });
});

// Update feature toggle (super_admin only)
export const updateFeatureToggle = catchAsync(async (req, res) => {
  const { featureId } = req.params;
  const { is_enabled, enabled_countries, disabled_countries, config } = req.body;

  // Verify super_admin role
  if (req.user.role !== 'super_admin') {
    throw new AppError('Only Super Admins can modify feature toggles', 403);
  }

  const updates = [];
  const params = [featureId];

  if (is_enabled !== undefined) {
    params.push(is_enabled);
    updates.push(`is_enabled = $${params.length}`);
  }

  if (enabled_countries) {
    params.push(enabled_countries);
    updates.push(`enabled_countries = $${params.length}`);
  }

  if (disabled_countries) {
    params.push(disabled_countries);
    updates.push(`disabled_countries = $${params.length}`);
  }

  if (config) {
    params.push(JSON.stringify(config));
    updates.push(`config = $${params.length}`);
  }

  if (updates.length === 0) {
    throw new AppError('No fields to update', 400);
  }

  params.push(req.user.id);
  const result = await query(
    `UPDATE feature_toggles
     SET ${updates.join(', ')}, updated_by = $${params.length}, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    params
  );

  if (result.rows.length === 0) {
    throw new AppError('Feature toggle not found', 404);
  }

  logger.info('Feature toggle updated by super_admin:', {
    adminId: req.user.id,
    featureId,
    updates: { is_enabled, enabled_countries, disabled_countries },
  });

  // Log the toggle update
  await logAdminAction({
    adminId: req.user.id,
    action: 'update_feature_toggle',
    targetId: featureId,
    targetType: 'feature_toggle',
    changes: { is_enabled, enabled_countries, disabled_countries },
    req
  });

  res.status(200).json({
    success: true,
    message: 'Feature toggle updated successfully',
    data: result.rows[0],
  });
});

// Get admin audit logs (admin only)
export const getAuditLogs = catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    adminId,
    action,
    targetType,
  } = req.query;
  const offset = (page - 1) * limit;

  let conditions = 'WHERE 1=1';
  const params = [];

  if (adminId) {
    params.push(adminId);
    conditions += ` AND al.admin_id = $${params.length}`;
  }

  if (action) {
    params.push(action);
    conditions += ` AND al.action = $${params.length}`;
  }

  if (targetType) {
    params.push(targetType);
    conditions += ` AND al.target_type = $${params.length}`;
  }

  const result = await query(
    `SELECT al.*, u.email as admin_email
     FROM audit_logs al
     LEFT JOIN users u ON al.user_id = u.id
     ${conditions}
     ORDER BY al.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) as total FROM audit_logs al ${conditions}`,
    params
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

// Get all exchange rates (admin only)
export const getExchangeRates = catchAsync(async (req, res) => {
  const result = await query(
    'SELECT * FROM exchange_rates ORDER BY from_currency, to_currency'
  );
  res.status(200).json({ success: true, data: result.rows });
});

// Create exchange rate (admin only)
export const createExchangeRate = catchAsync(async (req, res) => {
  const { from_currency, to_currency, rate, markup_percentage, source } = req.body;

  // Check if exists
  const existing = await query(
    'SELECT id FROM exchange_rates WHERE from_currency = $1 AND to_currency = $2',
    [from_currency, to_currency]
  );

  if (existing.rows.length > 0) {
    throw new AppError('Exchange rate pair already exists', 409);
  }

  const result = await query(
    `INSERT INTO exchange_rates
     (from_currency, to_currency, rate, markup_percentage, final_rate, source, is_active)
     VALUES ($1, $2, $3, $4, $3 * (1 + $4/100), $5, true)
     RETURNING *`,
    [from_currency, to_currency, rate, markup_percentage || 0, source || 'manual']
  );

  await logAdminAction({
    adminId: req.user.id,
    action: 'create_fx_rate',
    targetId: result.rows[0].id,
    targetType: 'exchange_rate',
    changes: req.body,
    req
  });

  res.status(201).json({ success: true, data: result.rows[0] });
});

// Update exchange rate / markup (admin only)
export const updateExchangeRate = catchAsync(async (req, res) => {
  const { rateId } = req.params;
  const { rate, markup_percentage, is_active } = req.body;

  const updates = [];
  const params = [rateId];

  if (rate !== undefined) {
    params.push(rate);
    updates.push(`rate = $${params.length}`);
  }
  if (markup_percentage !== undefined) {
    params.push(markup_percentage);
    updates.push(`markup_percentage = $${params.length}`);
  }
  if (is_active !== undefined) {
    params.push(is_active);
    updates.push(`is_active = $${params.length}`);
  }

  const result = await query(
    `UPDATE exchange_rates SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    params
  );

  await logAdminAction({
    adminId: req.user.id,
    action: 'update_fx_rate',
    targetId: rateId,
    targetType: 'exchange_rate',
    changes: { rate, markup_percentage, is_active },
    req
  });

  res.status(200).json({ success: true, data: result.rows[0] });
});

// Get fee configurations (admin only)
export const getFeeConfigs = catchAsync(async (req, res) => {
  const result = await query(
    'SELECT * FROM fee_configurations ORDER BY transaction_type, country'
  );
  res.status(200).json({ success: true, data: result.rows });
});

// Create fee configuration (admin only)
export const createFeeConfig = catchAsync(async (req, res) => {
  const { transaction_type, fee_type, fee_value, min_fee, max_fee, currency, country } = req.body;

  const result = await query(
    `INSERT INTO fee_configurations
     (transaction_type, fee_type, fee_value, min_fee, max_fee, currency, country, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true)
     RETURNING *`,
    [transaction_type, fee_type, fee_value, min_fee, max_fee, currency || 'USD', country]
  );

  await logAdminAction({
    adminId: req.user.id,
    action: 'create_fee_config',
    targetId: result.rows[0].id,
    targetType: 'fee_configuration',
    changes: req.body,
    req
  });

  res.status(201).json({ success: true, data: result.rows[0] });
});

// Update fee configuration (admin only)
export const updateFeeConfig = catchAsync(async (req, res) => {
  const { feeId } = req.params;
  const { fee_value, min_fee, max_fee, is_active } = req.body;

  const updates = [];
  const params = [feeId];

  if (fee_value !== undefined) {
    params.push(fee_value);
    updates.push(`fee_value = $${params.length}`);
  }
  if (min_fee !== undefined) {
    params.push(min_fee);
    updates.push(`min_fee = $${params.length}`);
  }
  if (max_fee !== undefined) {
    params.push(max_fee);
    updates.push(`max_fee = $${params.length}`);
  }
  if (is_active !== undefined) {
    params.push(is_active);
    updates.push(`is_active = $${params.length}`);
  }

  const result = await query(
    `UPDATE fee_configurations SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    params
  );

  await logAdminAction({
    adminId: req.user.id,
    action: 'update_fee_config',
    targetId: feeId,
    targetType: 'fee_configuration',
    changes: { fee_value, min_fee, max_fee, is_active },
    req
  });

  res.status(200).json({ success: true, data: result.rows[0] });
});

// Emergency shutdown toggle (super_admin only)
export const toggleEmergencyShutdown = catchAsync(async (req, res) => {
  const { is_shutdown } = req.body;

  if (req.user.role !== 'super_admin') {
    throw new AppError('Only Super Admins can trigger emergency shutdown', 403);
  }

  // Update a global feature toggle for the entire platform
  await query(
    `UPDATE feature_toggles SET is_enabled = $1, updated_at = NOW() WHERE feature_name = 'PLATFORM_GLOBAL'`,
    [!is_shutdown]
  );

  await logAdminAction({
    adminId: req.user.id,
    action: is_shutdown ? 'emergency_shutdown_activated' : 'emergency_shutdown_deactivated',
    targetId: 'PLATFORM_GLOBAL',
    targetType: 'system',
    changes: { is_shutdown },
    req
  });

  res.status(200).json({
    success: true,
    message: is_shutdown ? 'Platform emergency shutdown activated' : 'Platform access restored'
  });
});

// Process manual refund (admin only)
export const processRefund = catchAsync(async (req, res) => {
  const { transactionId } = req.params;
  const { reason } = req.body;

  // We should fetch the original transaction first
  const txResult = await query(
    'SELECT * FROM transactions WHERE id = $1',
    [transactionId]
  );

  if (txResult.rows.length === 0) {
    throw new AppError('Transaction not found', 404);
  }

  const tx = txResult.rows[0];

  if (tx.status === 'refunded') {
    throw new AppError('Transaction is already refunded', 400);
  }

  // Perform refund via LedgerService (to be imported if needed, or manual query here)
  // For simplicity here, we'll mark as refunded and reverse the balance
  await transaction(async (client) => {
    // 1. Update original transaction status
    await client.query(
      "UPDATE transactions SET status = 'refunded', updated_at = NOW() WHERE id = $1",
      [transactionId]
    );

    // 2. Reverse the amount back to user wallet
    await client.query(
      'UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE user_id = $2 AND currency = $3',
      [tx.from_amount, tx.user_id, tx.from_currency]
    );

    // 3. Log a refund entry in transactions
    await client.query(
      `INSERT INTO transactions (user_id, from_amount, from_currency, transaction_type, status, reference, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tx.user_id, tx.from_amount, tx.from_currency, 'refund', 'completed', `REF-${tx.reference}`, `Manual refund for ${tx.reference}: ${reason || 'No reason provided'}`]
    );
  });

  await logAdminAction({
    adminId: req.user.id,
    action: 'process_refund',
    targetId: transactionId,
    targetType: 'transaction',
    changes: { reason, amount: tx.from_amount },
    req
  });

  res.status(200).json({
    success: true,
    message: 'Manual refund processed successfully'
  });
});

// Get compliance statistics (admin only)
export const getComplianceStats = catchAsync(async (req, res) => {
  // Users by KYC Tier
  const kycStats = await query(
    'SELECT kyc_tier, COUNT(*) as count FROM users GROUP BY kyc_tier'
  );

  // High Risk Users Count
  const highRiskCount = await query(
    'SELECT COUNT(*) as count FROM aml_risk_scores WHERE risk_score >= 80'
  );

  // Recent KYC Submissions
  const recentKYC = await query(
    'SELECT COUNT(*) as count FROM kyc_documents WHERE submitted_at >= NOW() - INTERVAL \'24 hours\''
  );

  // Pending Reviews (KYC)
  const pendingReviews = await query(
    "SELECT COUNT(*) as count FROM kyc_documents WHERE status = 'pending'"
  );

  // Flagged Transactions
  const flaggedTransactions = await query(
    "SELECT COUNT(*) as count FROM transactions WHERE status = 'failed' OR status = 'flagged'" // Using failed as proxy for flagged if flagged status doesn't exist
  );

  res.status(200).json({
    success: true,
    data: {
      kyc_by_tier: kycStats.rows,
      high_risk_count: parseInt(highRiskCount.rows[0].count),
      recent_kyc_24h: parseInt(recentKYC.rows[0].count),
      pending_reviews: parseInt(pendingReviews.rows[0].count),
      flagged_count: parseInt(flaggedTransactions.rows[0].count)
    }
  });
});

// Get all wallets (admin only)
export const getAllWallets = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, currency, wallet_type, status, user_id } = req.query;
  const offset = (page - 1) * limit;

  let conditions = 'WHERE 1=1';
  const params = [];

  if (currency) {
    params.push(currency.toUpperCase());
    conditions += ` AND currency = $${params.length}`;
  }
  if (wallet_type) {
    params.push(wallet_type);
    conditions += ` AND wallet_type = $${params.length}`;
  }
  if (status) {
    params.push(status === 'active');
    conditions += ` AND is_active = $${params.length}`;
  }
  if (user_id) {
    params.push(user_id);
    conditions += ` AND user_id = $${params.length}`;
  }

  const result = await query(
    `SELECT w.*, u.email as user_email 
     FROM wallets w 
     JOIN users u ON w.user_id = u.id 
     ${conditions} 
     ORDER BY w.created_at DESC 
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) as total FROM wallets w ${conditions}`,
    params
  );

  res.status(200).json({
    success: true,
    data: {
      wallets: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    }
  });
});

// Get all transactions across the system (admin only)
export const getAllTransactions = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, type, status, user_id } = req.query;
  const offset = (page - 1) * limit;

  let conditions = 'WHERE 1=1';
  const params = [];

  if (type) {
    params.push(type);
    conditions += ` AND wt.transaction_type = $${params.length}`;
  }
  if (status) {
    params.push(status);
    conditions += ` AND wt.status = $${params.length}`;
  }
  if (user_id) {
    params.push(user_id);
    conditions += ` AND w.user_id = $${params.length}`;
  }

  const result = await query(
    `SELECT wt.*, u.email as user_email 
     FROM transactions wt 
     JOIN users u ON wt.user_id = u.id 
     ${conditions.replace('wt.transaction_type', 'wt.transaction_type::text').replace('w.user_id', 'wt.user_id')} 
     ORDER BY wt.created_at DESC 
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) as total 
     FROM transactions wt 
     ${conditions.replace('wt.transaction_type', 'wt.transaction_type::text').replace('w.user_id', 'wt.user_id')}`,
    params
  );

  res.status(200).json({
    success: true,
    data: {
      transactions: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    }
  });
});

// Get all virtual cards (admin only)
export const getAllCards = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status, user_id } = req.query;
  const offset = (page - 1) * limit;

  let conditions = 'WHERE 1=1';
  const params = [];

  if (status) {
    params.push(status);
    conditions += ` AND status = $${params.length}`;
  }
  if (user_id) {
    params.push(user_id);
    conditions += ` AND user_id = $${params.length}`;
  }

  const result = await query(
    `SELECT vc.*, u.email as user_email 
     FROM virtual_cards vc 
     JOIN users u ON vc.user_id = u.id 
     ${conditions} 
     ORDER BY vc.created_at DESC 
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) as total FROM virtual_cards vc ${conditions}`,
    params
  );

  res.status(200).json({
    success: true,
    data: {
      cards: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    }
  });
});

// Update card status (freeze/unfreeze) (admin only)
export const updateCardStatus = catchAsync(async (req, res) => {
  const { cardId } = req.params;
  const { status } = req.body; // 'frozen', 'active', 'terminated'

  const validStatuses = ['frozen', 'active', 'terminated'];
  if (!validStatuses.includes(status)) {
    throw new AppError('Invalid status', 400);
  }

  const result = await query(
    `UPDATE virtual_cards
     SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [status, cardId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Card not found', 404);
  }

  await logAdminAction({
    adminId: req.user.id,
    action: 'update_card_status',
    targetId: cardId,
    targetType: 'virtual_card',
    changes: { status },
    req
  });

  res.status(200).json({
    success: true,
    message: `Card status updated to ${status}`,
    data: result.rows[0]
  });
});

// Send Bulk SMS from Admin (System Announcements/Mass Alerts)
export const sendAdminBulkSMS = catchAsync(async (req, res) => {
  const { recipients, message } = req.body;
  // Similar logic to users but using system balance/no cost check
  for (const phone of recipients) {
    await sendSMS(phone, message);
  }
  res.status(200).json({ success: true, message: 'Admin bulk SMS sent' });
});

// Helper for logging admin actions (to be used in other controllers)
export const logAdminAction = async ({ adminId, action, targetId, targetType, changes, req }) => {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_id, entity_type, new_values, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        adminId,
        action,
        targetId,
        targetType,
        changes ? JSON.stringify(changes) : null,
        req?.ip || null,
        req?.get('user-agent') || null
      ]
    );
  } catch (err) {
    logger.error('Failed to log admin action:', err);
  }
};
// Get user specific feature access (super_admin only)
export const getUserFeatureAccess = catchAsync(async (req, res) => {
  const { userId } = req.params;

  // Ensure table exists (Lazy migration)
  await query(`
    CREATE TABLE IF NOT EXISTS user_feature_access (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      feature_name VARCHAR(100) NOT NULL,
      is_enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(user_id, feature_name)
    )
  `);

  const result = await query(
    'SELECT * FROM user_feature_access WHERE user_id = $1',
    [userId]
  );
  res.status(200).json({ success: true, data: result.rows });
});

// Update user specific feature access (super_admin only)
export const updateUserFeatureAccess = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { feature_name, is_enabled } = req.body;

  // Create table if not exists (Lazy migration)
  await query(`
    CREATE TABLE IF NOT EXISTS user_feature_access (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      feature_name VARCHAR(100) NOT NULL,
      is_enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(user_id, feature_name)
    )
  `);

  const result = await query(
    `INSERT INTO user_feature_access (user_id, feature_name, is_enabled)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, feature_name)
     DO UPDATE SET is_enabled = $3, updated_at = NOW()
     RETURNING *`,
    [userId, feature_name, is_enabled]
  );

  await logAdminAction({
    adminId: req.user.id,
    action: 'update_user_feature_access',
    targetId: userId,
    targetType: 'user',
    changes: { feature_name, is_enabled },
    req
  });

  res.status(200).json({ success: true, data: result.rows[0] });
});

// Get Orchestration Status (super_admin/admin)
export const getOrchestrationStatus = catchAsync(async (req, res) => {
  const providers = providerRegistry.getAll();
  const status = Object.keys(providers).map(type => ({
    type,
    adapters: Object.keys(providers[type]).map(name => ({
      name,
      status: 'active'
    }))
  }));

  res.status(200).json({ success: true, data: status });
});
