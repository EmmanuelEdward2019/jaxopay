import crypto from 'crypto';
import logger from './logger.js';

class WebhookVerifier {
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
            default:
                logger.warn(`[WEBHOOK] No verification for: ${provider}`);
                return process.env.NODE_ENV === 'development';
        }
    }

    _verifyFlutterwave(headers, payload) {
        const secret = process.env.FLUTTERWAVE_SECRET_HASH;
        const signature = headers['verif-hash'];
        if (!secret) return true; // Fail open for setup if not configured
        return signature === secret;
    }

    _verifyPaystack(headers, payload) {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        const signature = headers['x-paystack-signature'];
        if (!secret || !signature) return false;

        const hash = crypto
            .createHmac('sha512', secret)
            .update(payload)
            .digest('hex');

        return hash === signature;
    }

    _verifyKorapay(headers, payload) {
        const secret = process.env.KORAPAY_SECRET_KEY;
        const signature = headers['x-korapay-signature'];
        if (!secret || !signature) return false;

        const hash = crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');

        return hash === signature;
    }

    _verifyFincra(headers, payload) {
        const secret = process.env.FINCRA_SECRET_KEY;
        const signature = headers['x-fincra-signature'];
        if (!secret) return true;
        return signature === secret; // Fincra often uses a shared secret/hash
    }

    _verifySafeHaven(headers, payload) {
        // Safe Haven logic varies, placeholder
        return true;
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
}

export default new WebhookVerifier();
