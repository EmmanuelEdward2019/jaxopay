import express from 'express';
import { handleWebhook } from '../controllers/webhook.controller.js';

const router = express.Router();

/**
 * @route POST /api/v1/webhooks/:provider
 * @desc Handle incoming webhooks from external providers
 * @access Public (Signature verification handled in controller)
 */
router.post('/:provider', handleWebhook);

export default router;
