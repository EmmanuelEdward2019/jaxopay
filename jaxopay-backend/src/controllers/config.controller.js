import { query } from '../config/database.js';
import { catchAsync } from '../middleware/errorHandler.js';

// Get public feature toggles
export const getPublicFeatureToggles = catchAsync(async (req, res) => {
    const result = await query(
        'SELECT feature_name, is_enabled, enabled_countries, disabled_countries, config FROM feature_toggles'
    );

    // Convert to simple object for frontend
    const toggles = {};
    result.rows.forEach(toggle => {
        toggles[toggle.feature_name] = toggle.is_enabled;
    });

    res.status(200).json({
        success: true,
        data: toggles,
    });
});

// Get supported countries and currencies
export const getPlatformConfig = catchAsync(async (req, res) => {
    res.status(200).json({
        success: true,
        data: {
            countries: [
                { code: 'NG', name: 'Nigeria', currency: 'NGN' },
                { code: 'GH', name: 'Ghana', currency: 'GHS' },
                { code: 'KE', name: 'Kenya', currency: 'KES' },
                { code: 'ZA', name: 'South Africa', currency: 'ZAR' },
                { code: 'GB', name: 'United Kingdom', currency: 'GBP' },
                { code: 'CA', name: 'Canada', currency: 'CAD' },
                { code: 'CN', name: 'China', currency: 'CNY' },
                { code: 'US', name: 'United States', currency: 'USD' },
            ],
            currencies: [
                { code: 'NGN', symbol: '₦', name: 'Naira' },
                { code: 'GHS', symbol: 'GH₵', name: 'Cedi' },
                { code: 'KES', symbol: 'KSh', name: 'Shilling' },
                { code: 'ZAR', symbol: 'R', name: 'Rand' },
                { code: 'USD', symbol: '$', name: 'US Dollar' },
                { code: 'GBP', symbol: '£', name: 'Pound Sterling' },
                { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
                { code: 'CNY', symbol: '¥', name: 'Yuan' },
                { code: 'USDT', symbol: '₮', name: 'Tether' },
                { code: 'BTC', symbol: '₿', name: 'Bitcoin' },
                { code: 'ETH', symbol: 'Ξ', name: 'Ethereum' },
            ]
        }
    });
});
