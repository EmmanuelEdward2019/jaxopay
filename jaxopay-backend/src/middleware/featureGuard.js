
import { query } from '../config/database.js';
import { AppError } from './errorHandler.js';
import logger from '../utils/logger.js';

// Cache for feature toggles to reduce DB load
// In a production environment, use Redis. For now using in-memory cache with short TTL.
const cache = {
    data: {},
    timestamp: 0,
    TTL: 60 * 1000 // 1 minute
};

const getFeatureStatus = async (featureName) => {
    const now = Date.now();

    // Use cache if fresh
    if (now - cache.timestamp < cache.TTL && cache.data[featureName] !== undefined) {
        return cache.data[featureName];
    }

    // Fetch from DB
    // We fetch ALL toggles to update cache entirely, assuming table is small
    try {
        const result = await query('SELECT feature_name, is_enabled FROM feature_toggles');

        // Update cache
        const newCache = {};
        result.rows.forEach(row => {
            newCache[row.feature_name] = row.is_enabled;
        });

        cache.data = newCache;
        cache.timestamp = now;

        return cache.data[featureName];
    } catch (error) {
        logger.error('Error fetching feature toggles:', error);
        // If DB fails, fallback to strict (false) or lenient (true)?
        // Defaulting to true to avoid service outage on config failure, 
        // but depends on security requirement.
        return true;
    }
};

/**
 * Middleware to check if a feature is enabled
 * @param {string} featureName - The name of the feature to check
 */
export const requireFeature = (featureName) => async (req, res, next) => {
    try {
        const isEnabled = await getFeatureStatus(featureName);

        // If feature is explicitly disabled (false), block request
        // If undefined (not in DB), we assume enabled (or create a 'strict' mode)
        if (isEnabled === false) {
            return next(new AppError(`Feature '${featureName}' is currently disabled.`, 403));
        }

        next();
    } catch (error) {
        next(error);
    }
};
