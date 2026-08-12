import { query } from '../config/database.js';
import { catchAsync } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

// Unauthenticated — anyone on a public page (e.g. Contact) can submit. Stored so admins can
// actually see these instead of them being discarded client-side.
export const submitPublicForm = catchAsync(async (req, res) => {
  const { form_type = 'contact', name, email, phone, subject, message } = req.body;

  const result = await query(
    `INSERT INTO public_form_submissions (form_type, name, email, phone, subject, message, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, created_at`,
    [form_type, name, email, phone || null, subject || null, message, req.ip || null]
  );

  logger.info('Public form submission received:', { id: result.rows[0].id, form_type, email });

  res.status(201).json({
    success: true,
    message: "Thanks — we've received your message and will get back to you soon.",
    data: { id: result.rows[0].id },
  });
});
