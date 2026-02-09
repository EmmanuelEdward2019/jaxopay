import { query } from '../../config/database.js';
import { AppError } from '../../middleware/errorHandler.js';

class ComplianceEngine {
    /**
     * Validates if a user can perform a transaction of a certain amount.
     */
    async validateTransaction(userId, amount, operationType) {
        const user = await this._getUserComplianceState(userId);

        // 1. Check if user is active
        if (!user.is_active) throw new AppError('User account is restricted', 403);

        // 2. Check KYC Tier Limits
        const limits = this._getTierLimits(user.kyc_tier);
        if (amount > limits.max_per_transaction) {
            throw new AppError(`Transaction exceeds your tier limit of $${limits.max_per_transaction}`, 400);
        }

        // 3. Check AML Risk Score
        if (user.risk_score > 80) {
            throw new AppError('Enhanced due diligence required. Transaction flagged.', 403);
        }

        // 4. Check Country Restrictions
        if (this._isCountryRestricted(user.country_code, operationType)) {
            throw new Error(`${operationType} is not available in ${user.country_code}`);
        }

        return true;
    }

    async _getUserComplianceState(userId) {
        const res = await query(
            `SELECT u.id, u.kyc_tier, u.is_active, up.country_code, ars.risk_score 
       FROM users u 
       JOIN user_profiles up ON u.id = up.user_id 
       LEFT JOIN aml_risk_scores ars ON u.id = ars.user_id
       WHERE u.id = $1`,
            [userId]
        );

        if (res.rows.length === 0) throw new AppError('User not found', 404);
        return res.rows[0];
    }

    _getTierLimits(tier) {
        const tiers = {
            0: { max_per_transaction: 100, daily_limit: 500 },
            1: { max_per_transaction: 1000, daily_limit: 5000 },
            2: { max_per_transaction: 5000, daily_limit: 20000 },
            3: { max_per_transaction: 50000, daily_limit: 200000 }
        };
        return tiers[tier] || tiers[0];
    }

    _isCountryRestricted(countryCode, operationType) {
        // Logic to check restricted countries (e.g. OFAC list)
        return false;
    }
}

export default new ComplianceEngine();
