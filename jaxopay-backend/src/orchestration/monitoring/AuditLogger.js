import { query } from '../../config/database.js';
import logger from '../../utils/logger.js';

class OrchestrationAuditLogger {
    /**
     * Logs an interaction with an external provider.
     */
    async logProviderCall({
        providerId,
        serviceType,
        operation,
        requestData,
        responseData,
        statusCode,
        latency,
        success
    }) {
        try {
            // 1. Log to console/Winston
            logger.info(`Orchestration: ${providerId} | ${operation} | Success: ${success} | Latency: ${latency}ms`);

            // 2. Persist to DB for audit
            await query(
                `INSERT INTO audit_logs (
          action, 
          target_type, 
          changes, 
          metadata
        ) VALUES ($1, $2, $3, $4)`,
                [
                    `provider_call_${operation}`,
                    'orchestration',
                    JSON.stringify({
                        providerId,
                        serviceType,
                        statusCode,
                        latency,
                        success
                    }),
                    JSON.stringify({ request: requestData, response: responseData })
                ]
            );
        } catch (err) {
            logger.error('Failed to log orchestration audit:', err);
        }
    }
}

export default new OrchestrationAuditLogger();
