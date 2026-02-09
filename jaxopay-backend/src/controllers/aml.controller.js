import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

/**
 * AML Risk Scoring Logic
 * Base score: 0 (Low Risk) to 100 (High Risk)
 */
const calculateRiskScore = (user, txStats) => {
    let score = 20; // Starting base score
    const factors = [];

    // 1. KYC Tier Factor
    // Tier 0: +30, Tier 1: +10, Tier 2: 0, Tier 3: -10
    const kycBonus = { 'tier_0': 30, 'tier_1': 10, 'tier_2': 0, 'tier_3': -10 };
    const kycScore = kycBonus[user.kyc_tier] !== undefined ? kycBonus[user.kyc_tier] : 30;
    score += kycScore;
    if (kycScore > 0) factors.push({ name: 'low_kyc', weight: kycScore, message: 'Limited KYC verification' });

    // 2. Account Age Factor
    const accountAgeDays = Math.floor((new Date() - new Date(user.created_at)) / (1000 * 60 * 60 * 24));
    if (accountAgeDays < 7) {
        score += 20;
        factors.push({ name: 'new_account', weight: 20, message: 'Account is less than 7 days old' });
    } else if (accountAgeDays < 30) {
        score += 10;
        factors.push({ name: 'young_account', weight: 10, message: 'Account is less than 30 days old' });
    }

    // 3. Transaction Volume Factor (Last 30 days)
    const monthlyVolume = parseFloat(txStats.total_volume || 0);
    if (monthlyVolume > 10000) {
        score += 30;
        factors.push({ name: 'high_volume', weight: 30, message: 'Monthly volume exceeds $10,000' });
    } else if (monthlyVolume > 5000) {
        score += 15;
        factors.push({ name: 'medium_volume', weight: 15, message: 'Monthly volume exceeds $5,000' });
    }

    // 4. Transaction Frequency Factor
    const txCount = parseInt(txStats.tx_count || 0);
    if (txCount > 50) {
        score += 20;
        factors.push({ name: 'high_frequency', weight: 20, message: 'Over 50 transactions in 30 days' });
    }

    // Cap score at 100 and floor at 0
    score = Math.min(100, Math.max(0, score));

    let riskLevel = 'Low';
    if (score > 75) riskLevel = 'High';
    else if (score > 40) riskLevel = 'Medium';

    return { score, riskLevel, factors };
};

// Calculate and update risk score for a single user
export const refreshUserRiskScore = catchAsync(async (req, res) => {
    const { userId } = req.params;

    // Get user info
    const userRes = await query(
        'SELECT id, kyc_tier, created_at FROM users WHERE id = $1',
        [userId]
    );

    if (userRes.rows.length === 0) {
        throw new AppError('User not found', 404);
    }

    // Get transaction stats (last 30 days)
    const txStats = await query(
        `SELECT COUNT(t.id) as tx_count, SUM(t.from_amount) as total_volume
     FROM transactions t
     JOIN wallets w ON t.from_wallet_id = w.id OR t.to_wallet_id = w.id
     WHERE w.user_id = $1 AND t.status = 'completed' AND t.created_at >= NOW() - INTERVAL '30 days'`,
        [userId]
    );

    const { score, riskLevel, factors } = calculateRiskScore(userRes.rows[0], txStats.rows[0]);

    // Update aml_risk_scores table
    await query(
        `INSERT INTO aml_risk_scores (user_id, risk_score, risk_level, factors, calculated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
        risk_score = EXCLUDED.risk_score,
        risk_level = EXCLUDED.risk_level,
        factors = EXCLUDED.factors,
        calculated_at = NOW()`,
        [userId, score, riskLevel, JSON.stringify(factors)]
    );

    res.status(200).json({
        success: true,
        data: { userId, score, riskLevel, factors }
    });
});

// Get high risk users (admin only)
export const getHighRiskUsers = catchAsync(async (req, res) => {
    const result = await query(
        `SELECT ars.*, u.email, up.first_name, up.last_name
     FROM aml_risk_scores ars
     JOIN users u ON ars.user_id = u.id
     LEFT JOIN user_profiles up ON u.id = up.user_id
     WHERE ars.risk_level IN ('High', 'Medium')
     ORDER BY ars.risk_score DESC`
    );

    res.status(200).json({
        success: true,
        data: result.rows
    });
});
