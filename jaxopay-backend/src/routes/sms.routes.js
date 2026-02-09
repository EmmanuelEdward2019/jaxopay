import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGuard.js';
import { validate } from '../middleware/validator.js';
import { body } from 'express-validator';
import { sendBulkSMS, getSMSHistory, estimateSMS } from '../controllers/sms.controller.js';

const router = express.Router();

router.use(verifyToken);
router.use(requireFeature('bulk_sms'));

router.post(
    '/bulk',
    [
        body('recipients').isArray().notEmpty().withMessage('Recipients list must be a non-empty array'),
        body('message').isString().notEmpty().withMessage('Message is required'),
        validate
    ],
    sendBulkSMS
);

router.get('/history', getSMSHistory);

router.post(
    '/estimate',
    [
        body('recipients').isArray(),
        body('message').isString(),
        validate
    ],
    estimateSMS
);

export default router;
