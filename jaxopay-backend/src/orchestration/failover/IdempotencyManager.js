import { query } from '../../config/database.js';

class IdempotencyManager {
    /**
     * Checks if a request has already been processed and returns the result if found.
     */
    async getProcessedRequest(key) {
        const res = await query(
            'SELECT response_body FROM idempotency_keys WHERE key = $1 AND expires_at > NOW()',
            [key]
        );
        return res.rows[0]?.response_body;
    }

    /**
     * Saves a processed request.
     */
    async saveRequest(key, responseBody, ttlSeconds = 86400) {
        await query(
            `INSERT INTO idempotency_keys (key, response_body, expires_at)
       VALUES ($1, $2, NOW() + interval '$3 seconds')
       ON CONFLICT (key) DO UPDATE SET response_body = EXCLUDED.response_body`,
            [key, JSON.stringify(responseBody), ttlSeconds]
        );
    }
}

export default new IdempotencyManager();
