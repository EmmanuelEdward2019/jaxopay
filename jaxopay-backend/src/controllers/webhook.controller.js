import { query, transaction } from '../config/database.js';
import { catchAsync } from '../middleware/errorHandler.js';
import webhookVerifier from '../utils/webhookVerifier.js';
import ledgerService from '../orchestration/ledger/LedgerService.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';

/**
 * Unified webhook handler for all providers
 * POST /webhooks/:provider
 */
export const handleWebhook = catchAsync(async (req, res) => {
    const { provider } = req.params;
    const body = req.body;
    const headers = req.headers;

    logger.info(`[WEBHOOK] Received from ${provider}`, {
        event: body.event || body.action || body.type || body.event_type || 'unknown'
    });

    // 1. Verify signature
    const isValid = webhookVerifier.verify(provider, headers, body);
    if (!isValid) {
        logger.warn(`[WEBHOOK] Invalid/missing signature for: ${provider}`);
        // For unknown providers, still return 200 to stop retries but don't process
        if (!['korapay', 'vtpass', 'graph'].includes(provider.toLowerCase())) {
            return res.status(401).json({ success: false, message: 'Invalid signature' });
        }
    }

    // 2. Route to handler
    try {
        switch (provider.toLowerCase()) {
            case 'korapay':
                await processKorapay(body, headers);
                break;
            case 'vtpass':
                await processVTpass(body);
                break;
            case 'graph':
            case 'graph_finance':
                await processGraph(body);
                break;
            case 'flutterwave':
                await processFlutterwave(body);
                break;
            case 'paystack':
                await processPaystack(body);
                break;
            default:
                logger.info(`[WEBHOOK] No handler for ${provider}, acknowledged.`);
        }
    } catch (err) {
        logger.error(`[WEBHOOK] Error processing ${provider}:`, err);
        return res.status(202).json({ success: false, message: 'Processed with errors' });
    }

    res.status(200).json({ success: true, message: 'Webhook received' });
});

// ─────────────────────────────────────────────
// Korapay
// ─────────────────────────────────────────────
async function processKorapay(payload, headers) {
    // Verify Korapay HMAC signature
    const korapaySecret = process.env.KORAPAY_SECRET_KEY;
    if (korapaySecret && headers['x-korapay-signature']) {
        const hash = crypto.createHmac('sha256', korapaySecret)
            .update(JSON.stringify(payload))
            .digest('hex');
        if (hash !== headers['x-korapay-signature']) {
            logger.warn('[WEBHOOK] Korapay signature mismatch');
            return;
        }
    }

    const event = payload.event;
    const data = payload.data;

    switch (event) {
        case 'charge.success':
        case 'charge.failed': {
            // Incoming payment (e.g. user funding wallet via Korapay checkout)
            const status = event === 'charge.success' ? 'completed' : 'failed';
            await updateTransactionStatus(data.reference, status, data);

            if (status === 'completed' && data.amount) {
                // Credit the user's wallet
                await creditUserWallet(data.reference, data.amount, data.currency);
            }
            break;
        }
        case 'transfer.success':
        case 'transfer.failed': {
            // Outgoing payout (e.g. user sending to beneficiary bank)
            const payoutStatus = event === 'transfer.success' ? 'completed' : 'failed';
            await query(
                'UPDATE payments SET status = $1, updated_at = NOW() WHERE reference = $2',
                [payoutStatus, data.reference]
            );

            if (payoutStatus === 'failed') {
                // Refund user wallet on failed payout
                await refundFailedPayment(data.reference);
            }
            logger.info(`[WEBHOOK] Korapay payout ${data.reference} → ${payoutStatus}`);
            break;
        }
        case 'virtual_bank_account_transfer.success': {
            // Someone sent money TO a user's VBA (Virtual Bank Account)
            // Find VBA by account reference, credit the linked wallet
            const vbaRef = data.virtual_bank_account?.account_reference || data.account_reference;
            const amount = data.amount;
            const currency = data.currency || 'NGN';

            logger.info(`[WEBHOOK] VBA transfer received: ref=${vbaRef}, amount=${amount} ${currency}`);

            if (vbaRef && amount) {
                try {
                    const vba = await query(
                        'SELECT user_id, wallet_id FROM virtual_bank_accounts WHERE provider_reference = $1 AND is_active = true',
                        [vbaRef]
                    );
                    if (vba.rows.length > 0) {
                        const { user_id, wallet_id } = vba.rows[0];
                        await query(
                            'UPDATE wallets SET balance = balance + $1, available_balance = COALESCE(available_balance, 0) + $1, updated_at = NOW() WHERE id = $2',
                            [amount, wallet_id]
                        );
                        // Record transaction
                        await query(
                            `INSERT INTO transactions
                               (user_id, to_wallet_id, transaction_type, from_amount, to_amount,
                                from_currency, to_currency, net_amount, fee_amount, status, description, reference)
                             VALUES ($1, $2, 'deposit', $3, $3, $4, $4, $3, 0, 'completed', 'VBA bank transfer received', $5)`,
                            [user_id, wallet_id, amount, currency, `VBA-${data.reference || Date.now()}`]
                        );
                        logger.info(`[WEBHOOK] ✅ Wallet ${wallet_id} credited ${amount} ${currency} via VBA`);
                    } else {
                        logger.warn(`[WEBHOOK] VBA not found for ref: ${vbaRef}`);
                    }
                } catch (vbaErr) {
                    logger.error('[WEBHOOK] VBA credit error:', vbaErr);
                }
            }
            break;
        }
        default:
            logger.info(`[WEBHOOK] Korapay unhandled event: ${event}`);
    }
}

// ─────────────────────────────────────────────
// VTpass
// ─────────────────────────────────────────────
async function processVTpass(payload) {
    const { requestId, status, content } = payload;
    if (!requestId) return;

    const vtStatus = status === 'delivered' ? 'completed' :
        status === 'failed' ? 'failed' : 'processing';

    await query(
        'UPDATE bill_payments SET status = $1, updated_at = NOW() WHERE reference = $2',
        [vtStatus, requestId]
    );

    if (vtStatus === 'failed') {
        // Refund wallet for failed bill payment
        const bp = await query('SELECT user_id, amount, fee, currency FROM bill_payments WHERE reference = $1', [requestId]);
        if (bp.rows.length > 0) {
            const { user_id, amount, fee, currency } = bp.rows[0];
            const refundAmount = parseFloat(amount) + parseFloat(fee);
            await query(
                `UPDATE wallets SET balance = balance + $1, updated_at = NOW()
                 WHERE user_id = $2 AND currency = $3`,
                [refundAmount, user_id, currency]
            );
            await query('UPDATE bill_payments SET status = \'refunded\' WHERE reference = $1', [requestId]);
            logger.info(`[WEBHOOK] VTpass failed bill refunded: ${requestId} → ₦${refundAmount}`);
        }
    }

    logger.info(`[WEBHOOK] VTpass ${requestId} → ${vtStatus}`);
}

// ─────────────────────────────────────────────
// Graph Finance
// ─────────────────────────────────────────────
async function processGraph(payload) {
    const { type, data } = payload;

    switch (type) {
        case 'card.transaction': {
            // Record card spend
            const card = await query('SELECT id FROM virtual_cards WHERE provider_card_id = $1', [data.card_id]);
            if (card.rows.length > 0) {
                await query(
                    `INSERT INTO card_transactions
                       (card_id, transaction_type, amount, currency, merchant_name, merchant_category, status)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     ON CONFLICT DO NOTHING`,
                    [card.rows[0].id, data.type || 'purchase', data.amount,
                    data.currency || 'USD', data.merchant_name || '',
                    data.merchant_category || '', data.status || 'completed']
                );
                // Deduct from card balance
                await query(
                    'UPDATE virtual_cards SET balance = GREATEST(0, balance - $1), updated_at = NOW() WHERE id = $2',
                    [data.amount, card.rows[0].id]
                );
                logger.info(`[WEBHOOK] Graph card spend: ${data.amount} USD on ${data.merchant_name}`);
            }
            break;
        }
        case 'card.frozen':
        case 'card.unfrozen': {
            const newStatus = type === 'card.frozen' ? 'frozen' : 'active';
            await query(
                'UPDATE virtual_cards SET status = $1, updated_at = NOW() WHERE provider_card_id = $2',
                [newStatus, data.card_id]
            );
            break;
        }
        default:
            logger.info(`[WEBHOOK] Graph unhandled event: ${type}`);
    }
}

// ─────────────────────────────────────────────
// Legacy / other providers
// ─────────────────────────────────────────────
async function processFlutterwave(payload) {
    const { event, data } = payload;
    if (event === 'transfer.completed') {
        const status = data.status === 'SUCCESSFUL' ? 'completed' : 'failed';
        await updateTransactionStatus(data.reference, status, data);
    }
}

async function processPaystack(payload) {
    const { event, data } = payload;
    if (event === 'charge.success') {
        await updateTransactionStatus(data.reference, 'completed', data);
        await creditUserWallet(data.reference, data.amount / 100, data.currency);
    }
}

// ─────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────
async function updateTransactionStatus(reference, status, metadata) {
    await transaction(async (client) => {
        const txRes = await client.query(
            'SELECT * FROM transactions WHERE reference = $1 OR external_reference = $1 FOR UPDATE',
            [reference]
        );
        if (txRes.rows.length === 0) {
            logger.warn(`[WEBHOOK] Transaction not found: ${reference}`);
            return;
        }
        const tx = txRes.rows[0];
        if (tx.status === status) return;

        await client.query(
            'UPDATE transactions SET status = $1, metadata = $2, updated_at = NOW(), completed_at = $3 WHERE id = $4',
            [status, JSON.stringify({ ...(tx.metadata || {}), ...metadata }), status === 'completed' ? new Date() : null, tx.id]
        );
    });
}

async function creditUserWallet(reference, amount, currency) {
    try {
        // Look up a deposit transaction by reference to find the user
        const tx = await query('SELECT user_id FROM transactions WHERE reference = $1 LIMIT 1', [reference]);
        if (tx.rows.length === 0) return;

        await query(
            `UPDATE wallets SET balance = balance + $1, updated_at = NOW()
             WHERE user_id = $2 AND currency = $3`,
            [amount, tx.rows[0].user_id, (currency || 'USD').toUpperCase()]
        );
        logger.info(`[WEBHOOK] Wallet credited: ${amount} ${currency} for ref ${reference}`);
    } catch (err) {
        logger.error('[WEBHOOK] creditUserWallet error:', err);
    }
}

async function refundFailedPayment(reference) {
    try {
        const payment = await query('SELECT user_id, source_amount, fee, source_currency FROM payments WHERE reference = $1', [reference]);
        if (payment.rows.length === 0) return;

        const { user_id, source_amount, fee, source_currency } = payment.rows[0];
        const refund = parseFloat(source_amount) + parseFloat(fee || 0);

        await query(
            `UPDATE wallets SET balance = balance + $1, updated_at = NOW()
             WHERE user_id = $2 AND currency = $3`,
            [refund, user_id, source_currency]
        );
        logger.info(`[WEBHOOK] Refunded failed payment ${reference}: ${refund} ${source_currency}`);
    } catch (err) {
        logger.error('[WEBHOOK] refundFailedPayment error:', err);
    }
}
