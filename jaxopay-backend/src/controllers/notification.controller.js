import { query } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import cache, { CacheNamespaces, CacheTTL } from '../utils/cache.js';

// Cache key helper
const getNotificationCacheKey = (userId) => `notifications:${userId}`;

// Get all notifications for a user
export const getNotifications = catchAsync(async (req, res) => {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    const offset = (page - 1) * limit;

    // Use cache for first page only
    const cacheKey = `${getNotificationCacheKey(req.user.id)}:page${page}:unread${unreadOnly}:limit${limit}`;
    if (page == 1) { // Use loose equality for string/number flexibility
        const cached = cache.get(CacheNamespaces.USER_PROFILES, cacheKey);
        if (cached) {
            return res.status(200).json({
                success: true,
                data: cached,
                cached: true,
            });
        }
    }

    let sql = `
    SELECT id, user_id, type, title, message, is_read, created_at, data
    FROM notifications
    WHERE user_id = $1
  `;
    const params = [req.user.id];

    if (unreadOnly === 'true') {
        sql += ` AND is_read = false`;
    }

    sql += ` ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
    params.push(limit, offset);

    const result = await query(sql, params);

    // Get total count
    const countSql = `SELECT COUNT(*) FROM notifications WHERE user_id = $1 ${unreadOnly === 'true' ? 'AND is_read = false' : ''}`;
    const countResult = await query(countSql, [req.user.id]);

    const response = {
        notifications: result.rows,
        pagination: {
            total: parseInt(countResult.rows[0].count),
            page: parseInt(page),
            limit: parseInt(limit)
        }
    };

    // Cache first page for 10 seconds
    if (page == 1) {
        cache.set(CacheNamespaces.USER_PROFILES, cacheKey, response, CacheTTL.VERY_SHORT);
    }

    res.status(200).json({
        success: true,
        data: response
    });
});

// Clear notification cache helper
const clearNotificationCache = (userId) => {
    const prefix = `${getNotificationCacheKey(userId)}:`;
    const store = cache.getStore();
    // Clear all notification cache entries for this user
    for (const key of store.keys()) {
        if (key.includes(prefix)) {
            store.delete(key);
        }
    }
};

// Mark notification as read
export const markAsRead = catchAsync(async (req, res) => {
    const { id } = req.params;

    const result = await query(
        'UPDATE notifications SET is_read = true, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *',
        [id, req.user.id]
    );

    if (result.rows.length === 0) {
        throw new AppError('Notification not found', 404);
    }

    // Clear cache
    clearNotificationCache(req.user.id);

    res.status(200).json({
        success: true,
        data: result.rows[0]
    });
});

// Mark all notifications as read
export const markAllAsRead = catchAsync(async (req, res) => {
    await query(
        'UPDATE notifications SET is_read = true, updated_at = NOW() WHERE user_id = $1 AND is_read = false',
        [req.user.id]
    );

    // Clear cache
    clearNotificationCache(req.user.id);

    res.status(200).json({
        success: true,
        message: 'All notifications marked as read'
    });
});

// Get unread count - cached for 5 seconds to reduce DB load on polling
export const getUnreadCount = catchAsync(async (req, res) => {
    const cacheKey = `${getNotificationCacheKey(req.user.id)}:unread_count`;

    // Check cache first
    const cached = cache.get(CacheNamespaces.USER_PROFILES, cacheKey);
    if (cached !== null) {
        return res.status(200).json({
            success: true,
            count: cached,
            cached: true,
        });
    }

    const result = await query(
        'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
        [req.user.id]
    );

    const count = parseInt(result.rows[0].count);

    // Cache for 5 seconds
    cache.set(CacheNamespaces.USER_PROFILES, cacheKey, count, CacheTTL.VERY_SHORT);

    res.status(200).json({
        success: true,
        count
    });
});

// Delete a notification
export const deleteNotification = catchAsync(async (req, res) => {
    const { id } = req.params;

    const result = await query(
        'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
        [id, req.user.id]
    );

    if (result.rows.length === 0) {
        throw new AppError('Notification not found', 404);
    }

    res.status(200).json({
        success: true,
        message: 'Notification deleted'
    });
});
