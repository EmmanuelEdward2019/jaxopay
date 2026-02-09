import IdempotencyManager from '../orchestration/failover/IdempotencyManager.js';
import { catchAsync } from './errorHandler.js';

export const useIdempotency = catchAsync(async (req, res, next) => {
    const key = req.headers['x-idempotency-key'];

    if (!key) {
        return next();
    }

    const processedResponse = await IdempotencyManager.getProcessedRequest(key);
    if (processedResponse) {
        return res.status(200).json(JSON.parse(processedResponse));
    }

    // Override res.json to capture the response
    const originalJson = res.json;
    res.json = function (body) {
        // Only save successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
            IdempotencyManager.saveRequest(key, body).catch(err => {
                console.error('Failed to save idempotency key:', err);
            });
        }
        return originalJson.call(this, body);
    };

    next();
});
