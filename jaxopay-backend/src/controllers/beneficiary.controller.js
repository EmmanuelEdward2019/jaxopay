import { query } from '../config/database.js';
import { AppError, catchAsync } from '../middleware/errorHandler.js';

const VALID_TYPES = ['bank_account', 'airtime', 'data', 'cable', 'electricity', 'crypto'];

// GET /beneficiaries?type=cable  — list saved beneficiaries (optionally filtered by type)
export const listBeneficiaries = catchAsync(async (req, res) => {
  const { type } = req.query;
  const params = [req.user.id];
  let sql = `SELECT id, type, label, value, provider, provider_code, account_name, currency, metadata, last_used_at, created_at
             FROM saved_beneficiaries WHERE user_id = $1 AND is_active = true`;
  if (type) {
    if (!VALID_TYPES.includes(type)) throw new AppError(`Invalid type. Allowed: ${VALID_TYPES.join(', ')}`, 400);
    params.push(type);
    sql += ` AND type = $2`;
  }
  sql += ' ORDER BY last_used_at DESC NULLS LAST, created_at DESC';
  const result = await query(sql, params);
  res.status(200).json({ success: true, data: result.rows });
});

// POST /beneficiaries  — save a beneficiary (dedupes on type+value+provider_code)
export const createBeneficiary = catchAsync(async (req, res) => {
  const { type, label, value, provider, provider_code, account_name, currency, metadata } = req.body;

  if (!type || !VALID_TYPES.includes(type)) {
    throw new AppError(`A valid type is required. Allowed: ${VALID_TYPES.join(', ')}`, 400);
  }
  if (!value || !String(value).trim()) {
    throw new AppError('A beneficiary value (number/address) is required', 400);
  }

  const cleanValue = String(value).trim();

  // Dedupe: reactivate / update an existing identical beneficiary instead of duplicating.
  const existing = await query(
    `SELECT id FROM saved_beneficiaries
     WHERE user_id = $1 AND type = $2 AND value = $3 AND COALESCE(provider_code,'') = COALESCE($4,'')`,
    [req.user.id, type, cleanValue, provider_code || null]
  );

  if (existing.rows.length > 0) {
    const updated = await query(
      `UPDATE saved_beneficiaries
       SET is_active = true, label = COALESCE($2, label), provider = COALESCE($3, provider),
           account_name = COALESCE($4, account_name), currency = COALESCE($5, currency),
           metadata = COALESCE($6, metadata), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [existing.rows[0].id, label || null, provider || null, account_name || null,
        currency ? currency.toUpperCase() : null, metadata ? JSON.stringify(metadata) : null]
    );
    return res.status(200).json({ success: true, message: 'Beneficiary saved', data: updated.rows[0] });
  }

  const inserted = await query(
    `INSERT INTO saved_beneficiaries (user_id, type, label, value, provider, provider_code, account_name, currency, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [req.user.id, type, label || null, cleanValue, provider || null, provider_code || null,
      account_name || null, currency ? currency.toUpperCase() : null, metadata ? JSON.stringify(metadata) : null]
  );
  res.status(201).json({ success: true, message: 'Beneficiary saved', data: inserted.rows[0] });
});

// DELETE /beneficiaries/:id  — soft delete
export const deleteBeneficiary = catchAsync(async (req, res) => {
  const result = await query(
    `UPDATE saved_beneficiaries SET is_active = false, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND is_active = true RETURNING id`,
    [req.params.id, req.user.id]
  );
  if (result.rows.length === 0) throw new AppError('Beneficiary not found', 404);
  res.status(200).json({ success: true, message: 'Beneficiary removed' });
});

// Internal helper — bump last_used_at when a beneficiary is transacted with (best-effort).
export async function touchBeneficiaryUsage(userId, type, value) {
  try {
    await query(
      `UPDATE saved_beneficiaries SET last_used_at = NOW()
       WHERE user_id = $1 AND type = $2 AND value = $3 AND is_active = true`,
      [userId, type, String(value).trim()]
    );
  } catch { /* non-critical */ }
}
