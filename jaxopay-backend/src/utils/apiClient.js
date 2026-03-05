import axios from 'axios';
import logger from './logger.js';

/**
 * Creates a pre-configured Axios instance with:
 *  - Base URL from config
 *  - Default timeout
 *  - Automatic retry for 5xx + network errors
 *  - Request/response logging
 *  - Centralized error normalization
 *
 * Usage:
 *   const client = createApiClient({
 *     baseURL: 'https://api.korapay.com/merchant/api/v1',
 *     headers: { Authorization: 'Bearer sk_...' },
 *     timeout: 15000,
 *     retries: 2,          // optional, default 2
 *     retryDelay: 1000,    // optional, ms between retries
 *     label: 'Korapay',    // for log messages
 *   });
 */
export function createApiClient(config = {}) {
    const {
        retries = 2,
        retryDelay = 1000,
        label = 'API',
        ...axiosConfig
    } = config;

    const instance = axios.create({
        timeout: 15000,
        ...axiosConfig,
    });

    // ─── Request interceptor ─────────────────────────────
    instance.interceptors.request.use(
        (req) => {
            req._startTime = Date.now();
            req._retryCount = req._retryCount || 0;
            const suffix = req._retryCount > 0 ? ` (retry ${req._retryCount})` : '';
            logger.info(`[${label}] → ${req.method?.toUpperCase()} ${req.url}${suffix}`);
            return req;
        },
        (err) => Promise.reject(err)
    );

    // ─── Response interceptor ────────────────────────────
    instance.interceptors.response.use(
        (res) => {
            const duration = Date.now() - (res.config._startTime || Date.now());
            logger.info(`[${label}] ← ${res.status} ${res.config.url} (${duration}ms)`);
            return res;
        },
        async (err) => {
            const cfg = err.config || {};
            const duration = Date.now() - (cfg._startTime || Date.now());
            const status = err.response?.status;
            const isRetryable = !status || status >= 500 || err.code === 'ECONNABORTED' || err.code === 'ECONNRESET';
            const currentRetry = cfg._retryCount || 0;

            logger.error(`[${label}] ← ERROR ${status || err.code || 'NETWORK'} ${cfg.url} (${duration}ms): ${err.response?.data?.message || err.message}`);

            // Retry on transient (5xx / network) errors
            if (isRetryable && currentRetry < retries) {
                cfg._retryCount = currentRetry + 1;
                logger.warn(`[${label}] Retrying (${cfg._retryCount}/${retries}) in ${retryDelay}ms...`);
                await sleep(retryDelay * cfg._retryCount);  // exponential-ish delay
                return instance(cfg);
            }

            return Promise.reject(err);
        }
    );

    return instance;
}

/**
 * Normalize any provider error into a consistent shape:
 *   { message: string, statusCode: number, provider: string, raw?: any }
 */
export function normalizeError(error, provider = 'Unknown') {
    const status = error.statusCode || error.response?.status || 500;
    const raw = error.response?.data || null;
    const message = raw?.message
        || raw?.response_description
        || (Array.isArray(raw?.errors) ? raw.errors.map(e => e.message).join('; ') : null)
        || error.message
        || 'An unexpected error occurred';

    return {
        message: `${provider}: ${message}`,
        statusCode: status,
        provider,
        raw,
    };
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

export default createApiClient;
