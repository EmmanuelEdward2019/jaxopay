import { query } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

// Get active announcements
export const getActiveAnnouncements = catchAsync(async (req, res) => {
    const userRole = req.user?.role || 'end_user';

    const result = await query(
        `SELECT * FROM announcements 
     WHERE is_active = true 
     AND starts_at <= NOW() 
     AND (ends_at IS NULL OR ends_at >= NOW())
     AND (target_audience = 'all' OR target_audience = $1)
     ORDER BY created_at DESC`,
        [userRole]
    );

    res.status(200).json({
        success: true,
        data: result.rows
    });
});

// Admin: Create announcement
export const createAnnouncement = catchAsync(async (req, res) => {
    const { title, message, type = 'info', target_audience = 'all', ends_at } = req.body;

    if (!['admin', 'super_admin', 'compliance_officer'].includes(req.user.role)) {
        throw new AppError('Unauthorized', 403);
    }

    const result = await query(
        `INSERT INTO announcements (title, message, type, target_audience, ends_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
        [title, message, type, target_audience, ends_at]
    );

    res.status(201).json({
        success: true,
        data: result.rows[0]
    });
});

// Admin: Deactivate announcement
export const deactivateAnnouncement = catchAsync(async (req, res) => {
    const { id } = req.params;

    if (!['admin', 'super_admin', 'compliance_officer'].includes(req.user.role)) {
        throw new AppError('Unauthorized', 403);
    }

    const result = await query(
        'UPDATE announcements SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
        [id]
    );

    if (result.rows.length === 0) {
        throw new AppError('Announcement not found', 404);
    }

    res.status(200).json({
        success: true,
        data: result.rows[0]
    });
});
