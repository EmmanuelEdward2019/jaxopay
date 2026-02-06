import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

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
    params.push(parseInt(kyc_tier));
    conditions += ` AND u.kyc_tier = $${params.length}`;
  }

  if (status) {
    params.push(status);
    conditions += ` AND u.status = $${params.length}`;
  }

  if (role) {
    params.push(role);
    conditions += ` AND u.role = $${params.length}`;
  }

  const result = await query(
    `SELECT u.id, u.email, u.phone, u.role, u.kyc_tier, u.status,
            u.email_verified, u.two_fa_enabled, u.created_at,
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
      users: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit),
      },
    },
  });
});

// Get single user (admin only)
export const getUser = catchAsync(async (req, res) => {
  const { userId } = req.params;

  const result = await query(
    `SELECT u.id, u.email, u.phone, u.role, u.kyc_tier, u.status,
            u.email_verified, u.two_fa_enabled, u.created_at, u.updated_at,
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
     WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );

  // Get KYC documents
  const kycDocs = await query(
    `SELECT id, document_type, verification_status, submitted_at, verified_at
     FROM kyc_documents
     WHERE user_id = $1
     ORDER BY submitted_at DESC`,
    [userId]
  );

  res.status(200).json({
    success: true,
    data: {
      user: result.rows[0],
      wallets: wallets.rows,
      kyc_documents: kycDocs.rows,
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
    params.push(kyc_tier);
    updates.push(`kyc_tier = $${params.length}`);
  }

  if (status) {
    params.push(status);
    updates.push(`status = $${params.length}`);
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
     RETURNING id, email, role, kyc_tier, status`,
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
     SET status = 'suspended', updated_at = NOW()
     WHERE id = $1
     RETURNING id, email, status`,
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
       SET verification_status = $1,
           rejection_reason = $2,
           verified_at = NOW(),
           verified_by = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, user_id, document_type, verification_status`,
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
         WHERE user_id = $1 AND verification_status = 'approved'`,
        [doc.rows[0].user_id]
      );

      const approvedCount = parseInt(userDocs.rows[0].approved_count);
      let newTier = 0;

      if (approvedCount >= 1) newTier = 1;
      if (approvedCount >= 2) newTier = 2;
      if (approvedCount >= 3) newTier = 3;

      // Update user KYC tier
      await client.query(
        `UPDATE users SET kyc_tier = $1, updated_at = NOW() WHERE id = $2`,
        [newTier, doc.rows[0].user_id]
      );
    }

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

  // Users by KYC tier
  const usersByTier = await query(
    `SELECT kyc_tier, COUNT(*) as count
     FROM users
     GROUP BY kyc_tier
     ORDER BY kyc_tier`
  );

  // Total transactions
  const totalTransactions = await query(
    'SELECT COUNT(*) as count FROM wallet_transactions'
  );

  // Transaction volume (last 30 days)
  const transactionVolume = await query(
    `SELECT currency, SUM(amount) as total_volume
     FROM wallet_transactions
     WHERE created_at >= NOW() - INTERVAL '30 days'
       AND status = 'completed'
     GROUP BY currency`
  );

  // Pending KYC documents
  const pendingKYC = await query(
    `SELECT COUNT(*) as count
     FROM kyc_documents
     WHERE verification_status = 'pending'`
  );

  // Active virtual cards
  const activeCards = await query(
    `SELECT COUNT(*) as count
     FROM virtual_cards
     WHERE card_status = 'active' AND deleted_at IS NULL`
  );

  // Recent signups (last 7 days)
  const recentSignups = await query(
    `SELECT COUNT(*) as count
     FROM users
     WHERE created_at >= NOW() - INTERVAL '7 days'`
  );

  res.status(200).json({
    success: true,
    data: {
      total_users: parseInt(totalUsers.rows[0].count),
      users_by_tier: usersByTier.rows,
      total_transactions: parseInt(totalTransactions.rows[0].count),
      transaction_volume_30d: transactionVolume.rows,
      pending_kyc_documents: parseInt(pendingKYC.rows[0].count),
      active_virtual_cards: parseInt(activeCards.rows[0].count),
      recent_signups_7d: parseInt(recentSignups.rows[0].count),
    },
  });
});

// Get pending KYC documents (admin only)
export const getPendingKYC = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  const result = await query(
    `SELECT kd.id, kd.user_id, kd.document_type, kd.document_number,
            kd.verification_status, kd.submitted_at,
            u.email, up.first_name, up.last_name
     FROM kyc_documents kd
     JOIN users u ON kd.user_id = u.id
     LEFT JOIN user_profiles up ON u.id = up.user_id
     WHERE kd.verification_status = 'pending'
     ORDER BY kd.submitted_at ASC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) as total
     FROM kyc_documents
     WHERE verification_status = 'pending'`
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

