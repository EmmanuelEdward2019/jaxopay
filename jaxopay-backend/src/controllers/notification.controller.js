import { query } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

// Get all notifications for a user
export const getNotifications = catchAsync(async (req, res) => {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
    SELECT * FROM notifications 
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

    res.status(200).json({
        success: true,
        data: {
            notifications: result.rows,
            pagination: {
                total: parseInt(countResult.rows[0].count),
                page: parseInt(page),
                limit: parseInt(limit)
            }
        }
    });
});

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

    res.status(200).json({
        success: true,
        message: 'All notifications marked as read'
    });
});

// Get unread count
export const getUnreadCount = catchAsync(async (req, res) => {
    const result = await query(
        'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
        [req.user.id]
    );

    res.status(200).json({
        success: true,
        count: parseInt(result.rows[0].count)
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
