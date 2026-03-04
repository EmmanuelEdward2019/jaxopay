import { query, transaction } from '../config/database.js';
import { catchAsync } from '../middleware/errorHandler.js';
import webhookVerifier from '../utils/webhookVerifier.js';
import ledgerService from '../orchestration/ledger/LedgerService.js';
import logger from '../utils/logger.js';

/**
 * Handle incoming webhooks from various providers
 */
export const handleWebhook = catchAsync(async (req, res) => {
    const { provider } = req.params;
    const body = req.body;
    const headers = req.headers;

    logger.info(`[WEBHOOK] Received from ${provider}:`, {
        headers: req.headers['verif-hash'] || req.headers['x-paystack-signature'] ? 'Signed' : 'Unsigned',
        event: body.event || body.action || body.type || 'unknown'
    });

    // 1. Verify signature
    const isValid = webhookVerifier.verify(provider, headers, body);
    if (!isValid) {
        logger.warn(`[WEBHOOK] Invalid signature for provider: ${provider}`);
        return res.status(401).json({ success: false, message: 'Invalid signature' });
    }

    // 2. Process based on provider
    try {
        switch (provider.toLowerCase()) {
            case 'flutterwave':
                await processFlutterwave(body);
                break;
            case 'paystack':
                await processPaystack(body);
                break;
            case 'sudo':
                await processSudo(body);
                break;
            case 'strowallet':
                await processStrowallet(body);
                break;
            default:
                logger.info(`[WEBHOOK] No processing logic for ${provider}, acknowledging receipt.`);
        }
    } catch (err) {
        logger.error(`[WEBHOOK] Error processing ${provider} webhook:`, err);
        // We usually return 200/202 to the provider to stop retries, unless it's a transient error
        return res.status(202).json({ success: false, message: 'Processed with errors' });
    }

    // 3. Always acknowledge receipt to provider
    res.status(200).json({ success: true, message: 'Webhook received' });
});

/**
 * Process Flutterwave Webhooks
 */
async function processFlutterwave(payload) {
    const event = payload.event;
    const data = payload.data;

    if (event === 'transfer.completed') {
        const reference = data.reference;
        const status = data.status === 'SUCCESSFUL' ? 'completed' : 'failed';
        await updateTransactionStatus(reference, status, data);
    }
}

/**
 * Process Paystack Webhooks
 */
async function processPaystack(payload) {
    const event = payload.event;
    const data = payload.data;

    if (event === 'charge.success') {
        const reference = data.reference;
        await updateTransactionStatus(reference, 'completed', data);
    }
}

/**
 * Process Sudo Webhooks
 */
async function processSudo(payload) {
    // Sudo card transaction events
    const event = payload.type;
    const data = payload.data;

    if (event === 'transaction.approved') {
        // Handle virtual card spending
        logger.info(`[WEBHOOK] Sudo Card Approved: ${data.amount} ${data.currency}`);
    }
}

/**
 * Process Strowallet Webhooks
 */
async function processStrowallet(payload) {
    // Strowallet events
    logger.info('[WEBHOOK] Strowallet event received', payload);
}

/**
 * Helper to update transaction status and adjust ledger if completed
 */
async function updateTransactionStatus(reference, status, metadata) {
    await transaction(async (client) => {
        // 1. Find transaction
        const txRes = await client.query(
            'SELECT * FROM transactions WHERE reference = $1 OR external_reference = $1 FOR UPDATE',
            [reference]
        );

        if (txRes.rows.length === 0) {
            logger.warn(`[WEBHOOK] Transaction not found for reference: ${reference}`);
            return;
        }

        const tx = txRes.rows[0];

        // 2. Only update if status is changing
        if (tx.status === status) return;

        // 3. Update status
        await client.query(
            'UPDATE transactions SET status = $1, metadata = $2, updated_at = NOW(), completed_at = $3 WHERE id = $4',
            [status, JSON.stringify({ ...tx.metadata, ...metadata }), status === 'completed' ? new Date() : null, tx.id]
        );

        // 4. If completed and was pending, handle additional logic (e.g., credit user wallet if it was a deposit)
        if (status === 'completed' && tx.status !== 'completed') {
            logger.info(`[WEBHOOK] Transaction ${tx.id} marked as COMPLETED`);

            // Logic for specialized transaction types could go here
            // e.g., If it was a deposit, ensure the user's wallet is credited
            // However, LedgerService.recordMovement usually handles this during initiation
            // for transfers. For external deposits, we might need to credit here.
        }
    });
}
