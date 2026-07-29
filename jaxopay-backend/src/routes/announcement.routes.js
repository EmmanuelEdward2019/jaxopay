import express from 'express';
import * as announcementController from '../controllers/announcement.controller.js';
import { verifyToken, restrictTo } from '../middleware/auth.js';

const router = express.Router();

router.use(verifyToken);

router.get('/active', announcementController.getActiveAnnouncements);

// Admin only routes
router.post('/', restrictTo('admin', 'super_admin', 'support'), announcementController.createAnnouncement);
router.patch('/:id/deactivate', restrictTo('admin', 'super_admin', 'support'), announcementController.deactivateAnnouncement);

export default router;
