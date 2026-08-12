import express from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validator.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';
import { submitPublicForm } from '../controllers/publicForm.controller.js';

const router = express.Router();

// Unauthenticated by design — this is what public pages (Contact, etc.) submit to. Rate-limited
// per IP since it has no auth to gate spam otherwise.
router.post(
  '/',
  authRateLimiter,
  body('form_type').optional().isIn(['contact']),
  body('name').trim().isLength({ min: 1, max: 255 }),
  body('email').trim().isEmail(),
  body('phone').optional({ checkFalsy: true }).trim().isLength({ max: 50 }),
  body('subject').optional({ checkFalsy: true }).trim().isLength({ max: 255 }),
  body('message').trim().isLength({ min: 1, max: 5000 }),
  validate,
  submitPublicForm
);

export default router;
