import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

// Search flights
export const searchFlights = catchAsync(async (req, res) => {
  const {
    origin,
    destination,
    departure_date,
    return_date,
    passengers,
    cabin_class,
  } = req.query;

  // In production, this would call Amadeus API or similar
  // Mock flight search results
  const flights = [
    {
      id: 'FL001',
      airline: 'Emirates',
      airline_code: 'EK',
      flight_number: 'EK783',
      origin,
      destination,
      departure_time: `${departure_date}T08:00:00Z`,
      arrival_time: `${departure_date}T14:30:00Z`,
      duration: '6h 30m',
      stops: 0,
      cabin_class: cabin_class || 'economy',
      price: 450,
      currency: 'USD',
      available_seats: 12,
    },
    {
      id: 'FL002',
      airline: 'British Airways',
      airline_code: 'BA',
      flight_number: 'BA075',
      origin,
      destination,
      departure_time: `${departure_date}T10:30:00Z`,
      arrival_time: `${departure_date}T17:00:00Z`,
      duration: '6h 30m',
      stops: 0,
      cabin_class: cabin_class || 'economy',
      price: 420,
      currency: 'USD',
      available_seats: 8,
    },
    {
      id: 'FL003',
      airline: 'Turkish Airlines',
      airline_code: 'TK',
      flight_number: 'TK612',
      origin,
      destination,
      departure_time: `${departure_date}T15:00:00Z`,
      arrival_time: `${departure_date}T23:30:00Z`,
      duration: '8h 30m',
      stops: 1,
      cabin_class: cabin_class || 'economy',
      price: 380,
      currency: 'USD',
      available_seats: 15,
    },
  ];

  res.status(200).json({
    success: true,
    data: {
      flights,
      search_params: {
        origin,
        destination,
        departure_date,
        return_date,
        passengers: parseInt(passengers) || 1,
        cabin_class: cabin_class || 'economy',
      },
    },
  });
});

// Book flight
export const bookFlight = catchAsync(async (req, res) => {
  const {
    flight_id,
    passengers,
    contact_email,
    contact_phone,
    currency,
  } = req.body;

  // Check KYC tier
  if (req.user.kyc_tier < 2) {
    throw new AppError('KYC Tier 2 or higher required to book flights', 403);
  }

  // Mock flight details (in production, fetch from API)
  const flightPrice = 450;
  const bookingFee = 25;
  const totalAmount = flightPrice * passengers.length + bookingFee;

  const result = await transaction(async (client) => {
    // Get user wallet with lock
    const wallet = await client.query(
      `SELECT id, balance FROM wallets
       WHERE user_id = $1 AND currency = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [req.user.id, currency.toUpperCase()]
    );

    if (wallet.rows.length === 0) {
      throw new AppError(`No ${currency} wallet found`, 404);
    }

    if (parseFloat(wallet.rows[0].balance) < totalAmount) {
      throw new AppError('Insufficient balance', 400);
    }

    // Deduct from wallet
    await client.query(
      'UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2',
      [totalAmount, wallet.rows[0].id]
    );

    // Create flight booking
    const booking = await client.query(
      `INSERT INTO flight_bookings
       (user_id, flight_id, booking_reference, passengers, contact_email,
        contact_phone, total_amount, currency, booking_fee, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'confirmed', $10)
       RETURNING id, booking_reference, status, created_at`,
      [
        req.user.id,
        flight_id,
        generateBookingReference(),
        JSON.stringify(passengers),
        contact_email,
        contact_phone,
        totalAmount,
        currency.toUpperCase(),
        bookingFee,
        JSON.stringify({
          flight_price: flightPrice,
          passenger_count: passengers.length,
        }),
      ]
    );

    // Create wallet transaction
    await client.query(
      `INSERT INTO wallet_transactions
       (wallet_id, transaction_type, amount, currency, status, description, metadata)
       VALUES ($1, 'flight_booking', $2, $3, 'completed', 'Flight booking', $4)`,
      [
        wallet.rows[0].id,
        totalAmount,
        currency.toUpperCase(),
        JSON.stringify({
          booking_id: booking.rows[0].id,
          booking_reference: booking.rows[0].booking_reference,
          flight_id,
          passengers: passengers.length,
        }),
      ]
    );

    return {
      bookingId: booking.rows[0].id,
      bookingReference: booking.rows[0].booking_reference,
    };
  });

  logger.info('Flight booked:', {
    userId: req.user.id,
    bookingId: result.bookingId,
    amount: totalAmount,
  });

  res.status(201).json({
    success: true,
    message: 'Flight booked successfully',
    data: {
      booking_id: result.bookingId,
      booking_reference: result.bookingReference,
      total_amount: totalAmount,
      currency: currency.toUpperCase(),
      status: 'confirmed',
    },
  });
});

// Get user bookings
export const getBookings = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const offset = (page - 1) * limit;

  let conditions = 'WHERE user_id = $1';
  const params = [req.user.id];

  if (status) {
    params.push(status);
    conditions += ` AND status = $${params.length}`;
  }

  const result = await query(
    `SELECT id, flight_id, booking_reference, passengers, contact_email,
            total_amount, currency, booking_fee, status, created_at
     FROM flight_bookings
     ${conditions}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) as total FROM flight_bookings ${conditions}`,
    params
  );

  res.status(200).json({
    success: true,
    data: {
      bookings: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit),
      },
    },
  });
});

// Get single booking
export const getBooking = catchAsync(async (req, res) => {
  const { bookingId } = req.params;

  const result = await query(
    `SELECT id, flight_id, booking_reference, passengers, contact_email,
            contact_phone, total_amount, currency, booking_fee, status,
            metadata, created_at, updated_at
     FROM flight_bookings
     WHERE id = $1 AND user_id = $2`,
    [bookingId, req.user.id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Booking not found', 404);
  }

  res.status(200).json({
    success: true,
    data: result.rows[0],
  });
});

// Cancel booking
export const cancelBooking = catchAsync(async (req, res) => {
  const { bookingId } = req.params;

  const result = await transaction(async (client) => {
    // Get booking with lock
    const booking = await client.query(
      `SELECT id, user_id, total_amount, currency, status
       FROM flight_bookings
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [bookingId, req.user.id]
    );

    if (booking.rows.length === 0) {
      throw new AppError('Booking not found', 404);
    }

    if (booking.rows[0].status === 'cancelled') {
      throw new AppError('Booking already cancelled', 400);
    }

    if (booking.rows[0].status === 'completed') {
      throw new AppError('Cannot cancel completed booking', 400);
    }

    // Calculate refund (80% refund, 20% cancellation fee)
    const refundAmount = parseFloat(booking.rows[0].total_amount) * 0.8;
    const cancellationFee = parseFloat(booking.rows[0].total_amount) * 0.2;

    // Get user wallet
    const wallet = await client.query(
      `SELECT id FROM wallets
       WHERE user_id = $1 AND currency = $2 AND deleted_at IS NULL`,
      [req.user.id, booking.rows[0].currency]
    );

    if (wallet.rows.length > 0) {
      // Refund to wallet
      await client.query(
        'UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2',
        [refundAmount, wallet.rows[0].id]
      );

      // Create refund transaction
      await client.query(
        `INSERT INTO wallet_transactions
         (wallet_id, transaction_type, amount, currency, status, description, metadata)
         VALUES ($1, 'flight_refund', $2, $3, 'completed', 'Flight booking refund', $4)`,
        [
          wallet.rows[0].id,
          refundAmount,
          booking.rows[0].currency,
          JSON.stringify({
            booking_id: bookingId,
            cancellation_fee: cancellationFee,
          }),
        ]
      );
    }

    // Update booking status
    await client.query(
      `UPDATE flight_bookings
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1`,
      [bookingId]
    );

    return { refundAmount, cancellationFee };
  });

  logger.info('Flight booking cancelled:', {
    userId: req.user.id,
    bookingId,
    refund: result.refundAmount,
  });

  res.status(200).json({
    success: true,
    message: 'Booking cancelled successfully',
    data: {
      refund_amount: result.refundAmount,
      cancellation_fee: result.cancellationFee,
    },
  });
});

// Generate booking reference
function generateBookingReference() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let reference = '';
  for (let i = 0; i < 6; i++) {
    reference += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return reference;
}

