import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

// Create a new support ticket
export const createTicket = catchAsync(async (req, res) => {
    if (req.user.role !== 'end_user') {
        throw new AppError('Only customers can create support tickets.', 403);
    }
    const { subject, description, category, priority = 'medium' } = req.body;

    const result = await transaction(async (client) => {
        // Create ticket
        const ticketResult = await client.query(
            `INSERT INTO support_tickets (user_id, subject, category, priority)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
            [req.user.id, subject, category, priority]
        );

        const ticket = ticketResult.rows[0];

        // Create initial message
        await client.query(
            `INSERT INTO ticket_messages (ticket_id, sender_id, message)
       VALUES ($1, $2, $3)`,
            [ticket.id, req.user.id, description]
        );

        return ticket;
    });

    res.status(201).json({
        success: true,
        data: result
    });
});

// Get user's tickets
export const getMyTickets = catchAsync(async (req, res) => {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let sql = 'SELECT * FROM support_tickets WHERE user_id = $1';
    const params = [req.user.id];

    if (status) {
        sql += ' AND status = $2';
        params.push(status);
    }

    sql += ' ORDER BY updated_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const result = await query(sql, params);

    res.status(200).json({
        success: true,
        data: result.rows
    });
});

// Get ticket details and messages
export const getTicketDetails = catchAsync(async (req, res) => {
    const { id } = req.params;

    // Check if ticket exists and belongs to user (or user is admin)
    const ticketResult = await query(
        'SELECT * FROM support_tickets WHERE id = $1',
        [id]
    );

    if (ticketResult.rows.length === 0) {
        throw new AppError('Ticket not found', 404);
    }

    const ticket = ticketResult.rows[0];

    if (ticket.user_id !== req.user.id && !['admin', 'super_admin', 'compliance_officer'].includes(req.user.role)) {
        throw new AppError('Unauthorized', 403);
    }

    // Get messages
    const messagesResult = await query(
        `SELECT tm.*, up.first_name, up.last_name, u.role
     FROM ticket_messages tm
     LEFT JOIN user_profiles up ON tm.sender_id = up.user_id
     LEFT JOIN users u ON tm.sender_id = u.id
     WHERE tm.ticket_id = $1
     ORDER BY tm.created_at ASC`,
        [id]
    );

    res.status(200).json({
        success: true,
        data: {
            ticket,
            messages: messagesResult.rows
        }
    });
});

// Reply to a ticket
export const replyToTicket = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { message, attachments = [] } = req.body;

    // Check ticket ownership
    const ticketResult = await query(
        'SELECT * FROM support_tickets WHERE id = $1',
        [id]
    );

    if (ticketResult.rows.length === 0) {
        throw new AppError('Ticket not found', 404);
    }

    const ticket = ticketResult.rows[0];
    const isAdmin = ['admin', 'super_admin', 'compliance_officer'].includes(req.user.role);

    if (ticket.user_id !== req.user.id && !isAdmin) {
        throw new AppError('Unauthorized', 403);
    }

    if (ticket.status === 'closed') {
        throw new AppError('Cannot reply to a closed ticket', 400);
    }

    const result = await transaction(async (client) => {
        // Add message
        const messageResult = await client.query(
            `INSERT INTO ticket_messages (ticket_id, sender_id, message, attachments, is_internal)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
            [id, req.user.id, message, attachments, false]
        );

        // Update ticket status and last reply time
        let newStatus = ticket.status;
        if (isAdmin) {
            newStatus = 'pending';
        } else {
            newStatus = 'open';
        }

        await client.query(
            'UPDATE support_tickets SET status = $1, last_reply_at = NOW(), updated_at = NOW() WHERE id = $2',
            [newStatus, id]
        );

        return messageResult.rows[0];
    });

    res.status(201).json({
        success: true,
        data: result
    });
});

// Close a ticket
export const closeTicket = catchAsync(async (req, res) => {
    const { id } = req.params;

    const ticketResult = await query(
        'SELECT * FROM support_tickets WHERE id = $1',
        [id]
    );

    if (ticketResult.rows.length === 0) {
        throw new AppError('Ticket not found', 404);
    }

    const ticket = ticketResult.rows[0];
    if (ticket.user_id !== req.user.id && !['admin', 'super_admin', 'compliance_officer'].includes(req.user.role)) {
        throw new AppError('Unauthorized', 403);
    }

    await query(
        "UPDATE support_tickets SET status = 'closed', updated_at = NOW() WHERE id = $1",
        [id]
    );

    res.status(200).json({
        success: true,
        message: 'Ticket closed successfully'
    });
});

// Admin: Get all tickets
export const getAllTickets = catchAsync(async (req, res) => {
    if (!['admin', 'super_admin', 'compliance_officer'].includes(req.user.role)) {
        throw new AppError('Unauthorized', 403);
    }

    const { status, category, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
    SELECT st.*, u.email, up.first_name, up.last_name 
    FROM support_tickets st
    JOIN users u ON st.user_id = u.id
    LEFT JOIN user_profiles up ON u.id = up.user_id
    WHERE 1=1
  `;
    const params = [];

    if (status) {
        params.push(status);
        sql += ` AND st.status = $${params.length}`;
    }

    if (category) {
        params.push(category);
        sql += ` AND st.category = $${params.length}`;
    }

    sql += ` ORDER BY st.updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    res.status(200).json({
        success: true,
        data: result.rows
    });
});
