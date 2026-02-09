import axios from 'axios';
import BaseAdapter from '../../interfaces/BaseAdapter.js';
import PaymentServiceInterface from '../../interfaces/PaymentService.js';

class SafeHavenAdapter extends BaseAdapter {
    constructor(config = {}) {
        super(config);
        this.name = 'SafeHaven';
        this.baseUrl = process.env.SAFE_HAVEN_BASE_URL || 'https://api.safehavenmfb.com';
        this.secretKey = process.env.SAFE_HAVEN_SECRET_KEY;
    }

    async execute({ amount, currency, userId, metadata }) {
        // MOCK MODE: If no API key or TEST_MODE is enabled
        if (!this.secretKey || process.env.TEST_MODE === 'true') {
            console.log(`[ORCHESTRATION] SafeHaven Mock: Initiating ${currency} ${amount} for user ${userId}`);
            return {
                success: true,
                transactionId: 'mock-sh-' + Math.random().toString(36).substring(7),
                status: 'completed',
                message: 'Mock transaction successful (Sandbox)'
            };
        }

        try {
            // Production API call to Safe Haven
            const response = await axios.post(`${this.baseUrl}/v1/transfers`, {
                amount,
                currency,
                reference: metadata.reference,
                // ... Safe Haven specific fields
            }, {
                headers: { 'Authorization': `Bearer ${this.secretKey}` }
            });

            return this._normalizeResponse(response.data);
        } catch (err) {
            this.handleProviderError(err);
        }
    }

    async status(reference) {
        try {
            const response = await axios.get(`${this.baseUrl}/v1/transfers/${reference}`, {
                headers: { 'Authorization': `Bearer ${this.secretKey}` }
            });
            return this._normalizeResponse(response.data);
        } catch (err) {
            this.handleProviderError(err);
        }
    }

    _normalizeResponse(data) {
        // Transform provider-specific response to JAXOPAY internal format
        return {
            success: data.status === 'success',
            transactionId: data.reference,
            status: data.transaction_status, // mapped to: 'pending', 'completed', 'failed'
            raw: data
        };
    }

    handleProviderError(error) {
        const message = error.response?.data?.message || error.message;
        const statusCode = error.response?.status || 500;
        throw { message: `SafeHaven: ${message}`, statusCode, isProviderError: true };
    }
}

export default SafeHavenAdapter;
