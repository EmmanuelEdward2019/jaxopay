import crypto from 'crypto';
import logger from './logger.js';
import { verifySmileCallbackSignature } from '../services/smileId.service.js';

class WebhookVerifier {
    constructor() {
        // Store recent webhook IDs to prevent replay attacks
        this.recentWebhooks = new Map();
        this.REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
        this.cleanupInterval = setInterval(() => this._cleanupOldWebhooks(), 60000); // Clean every minute
    }

    /**
     * Clean up old webhook entries to prevent memory leak
     */
    _cleanupOldWebhooks() {
        const now = Date.now();
        for (const [id, timestamp] of this.recentWebhooks.entries()) {
            if (now - timestamp > this.REPLAY_WINDOW_MS) {
                this.recentWebhooks.delete(id);
            }
        }
    }

    /**
     * Check for replay attacks
     */
    _checkReplayAttack(webhookId, timestamp) {
        if (!webhookId) return true; // No ID to check, allow (provider-specific)

        // Check if we've seen this webhook before
        if (this.recentWebhooks.has(webhookId)) {
            logger.warn(`[WEBHOOK] Replay attack detected: ${webhookId}`);
            return false;
        }

        // Check timestamp if provided (within 5 minutes)
        if (timestamp) {
            const age = Date.now() - timestamp * 1000; // Convert to ms
            if (age > this.REPLAY_WINDOW_MS || age < -60000) { // Allow 1 min clock skew
                logger.warn(`[WEBHOOK] Webhook timestamp outside acceptable window: ${webhookId}`);
                return false;
            }
        }

        // Store this webhook ID
        this.recentWebhooks.set(webhookId, Date.now());
        return true;
    }

    /**
     * Verifies the signature for various providers
     * @param {string} provider - The provider name (e.g., 'flutterwave', 'paystack')
     * @param {object} headers - Incoming request headers
     * @param {string|object} body - Raw request body (as string for signature verification)
     * @returns {boolean}
     */
    verify(provider, headers, body) {
        const payload = typeof body === 'string' ? body : JSON.stringify(body);

        switch (provider.toLowerCase()) {
            case 'flutterwave':
                return this._verifyFlutterwave(headers, payload);
            case 'paystack':
                return this._verifyPaystack(headers, payload);
            case 'fincra':
                return this._verifyFincra(headers, payload);
            case 'korapay':
                return this._verifyKorapay(headers, payload);
            case 'safehaven':
                return this._verifySafeHaven(headers, payload);
            case 'sudo':
                return this._verifySudo(headers, payload);
            case 'vtpass':
                return this._verifyVTpass(headers, payload);
            case 'graph':
            case 'graph_finance':
                return this._verifyGraph(headers, payload);
            case 'smile_identity':
            case 'smile':
            case 'smile-id':
                return this._verifySmileIdentity(body);
            case 'quidax':
                return this._verifyQuidax(headers, payload);
            default:
                logger.warn(`[WEBHOOK] No verification for: ${provider}`);
                return process.env.NODE_ENV === 'development';
        }
    }

    _verifyFlutterwave(headers, payload) {
        const secret = process.env.FLUTTERWAVE_SECRET_HASH;
        const signature = headers['verif-hash'];

        // NEVER fail open in production
        if (!secret) {
            logger.warn('[WEBHOOK] Flutterwave webhook secret not configured');
            return process.env.NODE_ENV === 'development';
        }

        if (!signature) {
            logger.warn('[WEBHOOK] Flutterwave signature missing');
            return false;
        }

        return signature === secret;
    }

    _verifyPaystack(headers, payload) {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        const signature = headers['x-paystack-signature'];

        if (!secret) {
            logger.warn('[WEBHOOK] Paystack secret not configured');
            return process.env.NODE_ENV === 'development';
        }

        if (!signature) {
            logger.warn('[WEBHOOK] Paystack signature missing');
            return false;
        }

        const hash = crypto
            .createHmac('sha512', secret)
            .update(payload)
            .digest('hex');

        return hash === signature;
    }

    _verifyKorapay(headers, payload) {
        const secret = process.env.KORAPAY_SECRET_KEY;
        const signature = headers['x-korapay-signature'];

        if (!secret) {
            logger.warn('[WEBHOOK] Korapay secret not configured');
            return process.env.NODE_ENV === 'development';
        }

        if (!signature) {
            logger.warn('[WEBHOOK] Korapay signature missing');
            return false;
        }

        const hash = crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');

        return hash === signature;
    }

    _verifyFincra(headers, payload) {
        const secret = process.env.FINCRA_SECRET_KEY;
        const signature = headers['x-fincra-signature'];

        if (!secret) {
            logger.warn('[WEBHOOK] Fincra secret not configured');
            return process.env.NODE_ENV === 'development';
        }

        if (!signature) {
            logger.warn('[WEBHOOK] Fincra signature missing');
            return false;
        }

        return signature === secret;
    }

    _verifySafeHaven(headers, payload) {
        const secret = process.env.SAFEHAVEN_WEBHOOK_SECRET;
        const signature = headers['x-safehaven-signature'];

        if (!secret) {
            logger.warn('[WEBHOOK] SafeHaven secret not configured');
            return process.env.NODE_ENV === 'development';
        }

        if (!signature) {
            logger.warn('[WEBHOOK] SafeHaven signature missing');
            return false;
        }

        // Implement actual SafeHaven signature verification
        const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex');
        return hash === signature;
    }

    _verifySudo(headers, payload) {
        const secret = process.env.SUDO_WEBHOOK_SECRET;
        const signature = headers['x-sudo-signature'];
        if (!secret || !signature) return false;

        const hash = crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('base64');

        return hash === signature;
    }

    _verifyVTpass(headers, payload) {
        // VTpass sends a shared secret in the 'x-vtpass-secret' header
        const secret = process.env.VTPASS_SECRET_KEY;
        const incoming = headers['x-vtpass-secret'];
        if (!secret) return process.env.NODE_ENV === 'development';
        return incoming === secret;
    }

    _verifyGraph(headers, payload) {
        // Graph Finance sends HMAC-SHA256 in 'x-graph-signature'
        const secret = process.env.GRAPH_WEBHOOK_SECRET || process.env.GRAPH_API_KEY;
        const signature = headers['x-graph-signature'];
        if (!secret) return process.env.NODE_ENV === 'development';
        if (!signature) return false;

        const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex');
        return hash === signature;
    }

    /** Smile ID — signature on JSON body (parsed object or string) */
    _verifySmileIdentity(body) {
        let parsed = body;
        if (typeof body === 'string') {
            try {
                parsed = JSON.parse(body);
            } catch {
                return false;
            }
        }
        if (!parsed || typeof parsed !== 'object') return false;
        if (process.env.SMILE_WEBHOOK_SKIP_VERIFY === 'true') {
            logger.warn('[WEBHOOK] Smile ID verification skipped (SMILE_WEBHOOK_SKIP_VERIFY)');
            return true;
        }
        return verifySmileCallbackSignature(parsed);
    }

    /**
     * Quidax (HMAC-SHA256)
     * Header: quidax-signature
     *   Format A (Quidax docs): t=<timestamp>,s=<signature>
     *   Format B (older):       t=<timestamp>,v1=<signature>
     *   Format C (raw):         <hex-signature>
     *
     * Signing key priority: QUIDAX_WEBHOOK_SECRET → QUIDAX_API_KEY → QUIDAX_SECRET_KEY
     * Quidax support confirmed the API key is used as the webhook HMAC secret.
     */
    _verifyQuidax(headers, payload) {
        const secret =
            process.env.QUIDAX_WEBHOOK_SECRET ||
            process.env.QUIDAX_API_KEY ||
            process.env.QUIDAX_SECRET_KEY;
        const signatureHeader = headers['quidax-signature'] || headers['x-quidax-signature'];

        if (!secret) return process.env.NODE_ENV === 'development';

        // No signature header at all — accept in dev, reject in prod
        if (!signatureHeader) {
            if (process.env.NODE_ENV !== 'production') {
                logger.warn('[WEBHOOK] Quidax: no signature header — accepting (non-prod)');
                return true;
            }
            return false;
        }

        let signature = signatureHeader;
        let timestamp = null;

        // Format A: t=<timestamp>,s=<sig>
        // Format B: t=<timestamp>,v1=<sig>
        if (signatureHeader.includes(',')) {
            const parts = signatureHeader.split(',');
            const tPart = parts.find(p => p.startsWith('t='));
            const sPart = parts.find(p => p.startsWith('s='));
            const vPart = parts.find(p => p.startsWith('v1='));
            if (tPart) timestamp = tPart.slice(2);
            if (sPart) signature = sPart.slice(2);
            else if (vPart) signature = vPart.slice(3);
        }

        // signed_payload = timestamp + "." + rawBody  (per Quidax docs)
        const toSign = timestamp ? `${timestamp}.${payload}` : payload;
        const hash = crypto.createHmac('sha256', secret).update(toSign).digest('hex');

        return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
    }
}

export default new WebhookVerifier();
