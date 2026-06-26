import express from 'express';
import * as ticketController from '../controllers/ticket.controller.js';
import { verifyToken, restrictTo } from '../middleware/auth.js';

const router = express.Router();

router.use(verifyToken);

router.post('/', restrictTo('user', 'end_user'), ticketController.createTicket);
router.get('/my-tickets', ticketController.getMyTickets);
router.get('/:id', ticketController.getTicketDetails);
router.post('/:id/reply', ticketController.replyToTicket);
router.patch('/:id/close', ticketController.closeTicket);
router.post('/:id/rate', restrictTo('user', 'end_user'), ticketController.rateTicket);

// Admin only routes
router.get('/', restrictTo('admin', 'super_admin', 'compliance_officer'), ticketController.getAllTickets);
router.patch('/:id/status', restrictTo('admin', 'super_admin', 'compliance_officer'), ticketController.updateTicketStatus);

export default router;
