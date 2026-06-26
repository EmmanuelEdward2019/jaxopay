import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import { sendEmail } from '../services/email.service.js';

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

    // Fetch user details for email
    const userResult = await query(
        `SELECT u.email, up.first_name 
         FROM users u 
         LEFT JOIN user_profiles up ON u.id = up.user_id 
         WHERE u.id = $1`,
        [req.user.id]
    );

    if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        sendEmail({
            to: user.email,
            subject: `Support Ticket Received: ${subject}`,
            template: 'ticketCreated',
            data: {
                name: user.first_name || 'User',
                subject: subject,
                id: result.id,
                frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173'
            }
        }).catch(err => logger.error('Error sending ticket created email:', err));
    }

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

    // If admin replied, send email to user
    if (isAdmin) {
        const userResult = await query(
            `SELECT u.email, up.first_name 
             FROM users u 
             LEFT JOIN user_profiles up ON u.id = up.user_id 
             WHERE u.id = $1`,
            [ticket.user_id]
        );

        if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            sendEmail({
                to: user.email,
                subject: `New Reply on Ticket: ${ticket.subject}`,
                template: 'ticketReplied',
                data: {
                    name: user.first_name || 'User',
                    subject: ticket.subject,
                    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173'
                }
            }).catch(err => logger.error('Error sending ticket reply email:', err));
        }
    }

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

    // Send ticket closed email
    const userResult = await query(
        `SELECT u.email, up.first_name 
         FROM users u 
         LEFT JOIN user_profiles up ON u.id = up.user_id 
         WHERE u.id = $1`,
        [ticket.user_id]
    );

    if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        sendEmail({
            to: user.email,
            subject: `Support Ticket Closed: ${ticket.subject}`,
            template: 'ticketClosed',
            data: {
                name: user.first_name || 'User',
                subject: ticket.subject,
                frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173'
            }
        }).catch(err => logger.error('Error sending ticket closed email:', err));
    }

    res.status(200).json({
        success: true,
        message: 'Ticket closed successfully'
    });
});

// Admin: set a ticket's status (open / pending / in_progress / resolved / closed)
const TICKET_STATUSES = ['open', 'pending', 'in_progress', 'resolved', 'closed'];

export const updateTicketStatus = catchAsync(async (req, res) => {
    const { id } = req.params;
    const status = String(req.body.status || '').toLowerCase();

    if (!TICKET_STATUSES.includes(status)) {
        throw new AppError(`Invalid status. Allowed: ${TICKET_STATUSES.join(', ')}`, 400);
    }

    const ticketResult = await query('SELECT * FROM support_tickets WHERE id = $1', [id]);
    if (ticketResult.rows.length === 0) {
        throw new AppError('Ticket not found', 404);
    }
    const ticket = ticketResult.rows[0];

    const updated = await query(
        'UPDATE support_tickets SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, status',
        [status, id]
    );

    // Notify the user when their ticket is resolved or closed.
    if (status === 'resolved' || status === 'closed') {
        const userResult = await query(
            `SELECT u.email, up.first_name FROM users u
             LEFT JOIN user_profiles up ON u.id = up.user_id WHERE u.id = $1`,
            [ticket.user_id]
        );
        if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            sendEmail({
                to: user.email,
                subject: `Support Ticket ${status === 'resolved' ? 'Resolved' : 'Closed'}: ${ticket.subject}`,
                template: 'ticketClosed',
                data: {
                    name: user.first_name || 'User',
                    subject: ticket.subject,
                    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
                },
            }).catch((err) => logger.error('Error sending ticket status email:', err));
        }
    }

    res.status(200).json({
        success: true,
        message: `Ticket marked as ${status.replace('_', ' ')}`,
        data: updated.rows[0],
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

// Rate a ticket
export const rateTicket = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { rating, review_comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
        throw new AppError('Rating must be between 1 and 5', 400);
    }

    const ticketResult = await query(
        'SELECT * FROM support_tickets WHERE id = $1',
        [id]
    );

    if (ticketResult.rows.length === 0) {
        throw new AppError('Ticket not found', 404);
    }

    const ticket = ticketResult.rows[0];

    // Only the ticket owner can rate it
    if (ticket.user_id !== req.user.id) {
        throw new AppError('Unauthorized', 403);
    }

    // Only closed tickets can be rated
    if (ticket.status !== 'closed') {
        throw new AppError('Only closed tickets can be rated', 400);
    }

    // Check if already rated
    if (ticket.rating) {
        throw new AppError('Ticket has already been rated', 400);
    }

    await query(
        'UPDATE support_tickets SET rating = $1, review_comment = $2, updated_at = NOW() WHERE id = $3',
        [rating, review_comment, id]
    );

    res.status(200).json({
        success: true,
        message: 'Ticket rated successfully'
    });
});
