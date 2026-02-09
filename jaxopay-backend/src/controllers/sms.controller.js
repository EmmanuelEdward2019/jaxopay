import { query, transaction } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';
import { sendSMS } from '../services/sms.service.js';
import logger from '../utils/logger.js';

// Bulk SMS estimated cost per unit
const SMS_UNIT_COST = 4.0; // NGN per unit (mock)

/**
 * Send Bulk SMS
 * POST /api/v1/sms/bulk
 */
export const sendBulkSMS = catchAsync(async (req, res) => {
    const { recipients, message, sender_id } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        throw new AppError('At least one recipient is required', 400);
    }

    if (!message) {
        throw new AppError('Message content is required', 400);
    }

    const recipientCount = recipients.length;
    // Simple unit estimation (160 chars per unit)
    const unitsPerSMS = Math.ceil(message.length / 160);
    const totalUnits = recipientCount * unitsPerSMS;
    const totalCost = totalUnits * SMS_UNIT_COST;

    const result = await transaction(async (client) => {
        // 1. Check user balance (NGN wallet usually)
        const wallet = await client.query(
            "SELECT id, balance FROM wallets WHERE user_id = $1 AND currency = 'NGN' FOR UPDATE",
            [req.user.id]
        );

        if (wallet.rows.length === 0) {
            throw new AppError('NGN wallet not found. Bulk SMS requires an NGN wallet.', 404);
        }

        if (parseFloat(wallet.rows[0].balance) < totalCost) {
            throw new AppError(`Insufficient balance. Estimated cost: NGN ${totalCost}`, 400);
        }

        // 2. Deduct cost from wallet
        await client.query(
            'UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2',
            [totalCost, wallet.rows[0].id]
        );

        // 3. Create SMS Batch Record
        const batchResult = await client.query(
            `INSERT INTO sms_batches (user_id, sender_id, message, total_recipients, total_units, total_cost, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'processing')
       RETURNING id`,
            [req.user.id, sender_id || 'JAXOPAY', message, recipientCount, totalUnits, totalCost]
        );

        const batchId = batchResult.rows[0].id;

        // 4. Register transaction
        await client.query(
            `INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, currency, status, description, metadata)
       VALUES ($1, 'bulk_sms', $2, 'NGN', 'completed', $3, $4)`,
            [
                wallet.rows[0].id,
                totalCost,
                `Bulk SMS: ${recipientCount} recipients`,
                JSON.stringify({ batch_id: batchId, units: totalUnits })
            ]
        );

        return { batchId, totalCost };
    });

    // 5. Trigger Async Sending (In production, use a queue/worker)
    // For now, we do a "fire and forget" loop for the demo/build
    processSMSBatch(result.batchId, recipients, message, sender_id);

    res.status(202).json({
        success: true,
        message: 'Bulk SMS batch initiated',
        data: {
            batch_id: result.batchId,
            estimated_cost: result.totalCost,
            recipients: recipientCount
        }
    });
});

/**
 * Get SMS implementation status
 */
export const getSMSHistory = catchAsync(async (req, res) => {
    const result = await query(
        'SELECT * FROM sms_batches WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
        [req.user.id]
    );
    res.status(200).json({ success: true, data: result.rows });
});

/**
 * Estimate SMS Cost
 */
export const estimateSMS = catchAsync(async (req, res) => {
    const { recipients, message } = req.body;
    const count = Array.isArray(recipients) ? recipients.length : 0;
    const units = Math.ceil((message?.length || 0) / 160);
    const cost = count * units * SMS_UNIT_COST;

    res.status(200).json({
        success: true,
        data: { recipients: count, units, total_cost: cost }
    });
});

// Helper to process SMS batch in background
async function processSMSBatch(batchId, recipients, message, senderId) {
    let successful = 0;
    let failed = 0;

    for (const phone of recipients) {
        try {
            await sendSMS(phone, message);
            successful++;
        } catch (err) {
            failed++;
            logger.error(`Failed to send SMS to ${phone} in batch ${batchId}:`, err);
        }
    }

    // Update batch status
    await query(
        "UPDATE sms_batches SET status = 'completed', successful_count = $1, failed_count = $2, finished_at = NOW() WHERE id = $3",
        [successful, failed, batchId]
    );
}
