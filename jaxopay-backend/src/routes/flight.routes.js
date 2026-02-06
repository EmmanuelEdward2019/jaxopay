import express from 'express';
import { verifyToken, requireKYCTier } from '../middleware/auth.js';
import { validate } from '../middleware/validator.js';
import { body, param, query } from 'express-validator';
import {
  searchFlights,
  bookFlight,
  getBookings,
  getBooking,
  cancelBooking,
} from '../controllers/flight.controller.js';

const router = express.Router();

// All flight routes require authentication
router.use(verifyToken);

// Search flights
router.get(
  '/search',
  query('origin').isString(),
  query('destination').isString(),
  query('departure_date').isISO8601(),
  query('return_date').optional().isISO8601(),
  query('passengers').optional().isInt({ min: 1, max: 9 }),
  query('cabin_class').optional().isIn(['economy', 'premium_economy', 'business', 'first']),
  validate,
  searchFlights
);

// Get user bookings
router.get(
  '/bookings',
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isString(),
  validate,
  getBookings
);

// Get single booking
router.get(
  '/bookings/:bookingId',
  param('bookingId').isUUID(),
  validate,
  getBooking
);

// Book flight (requires KYC Tier 2+)
router.post(
  '/book',
  requireKYCTier(2),
  body('flight_id').isString(),
  body('passengers').isArray({ min: 1, max: 9 }),
  body('passengers.*.first_name').isString(),
  body('passengers.*.last_name').isString(),
  body('passengers.*.date_of_birth').isISO8601(),
  body('passengers.*.passport_number').optional().isString(),
  body('contact_email').isEmail(),
  body('contact_phone').isString(),
  body('currency').isString().isLength({ min: 3, max: 3 }),
  validate,
  bookFlight
);

// Cancel booking
router.delete(
  '/bookings/:bookingId',
  param('bookingId').isUUID(),
  validate,
  cancelBooking
);

export default router;

