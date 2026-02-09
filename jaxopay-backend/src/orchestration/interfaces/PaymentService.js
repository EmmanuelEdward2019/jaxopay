/**
 * Interface for Payment Services.
 * All payment-related adapters must implement these methods.
 */
class PaymentServiceInterface {
    /**
     * Initialize a payment session or intent.
     * @param {Object} params { amount, currency, userId, metadata }
     */
    async initiate(params) {
        throw new Error('Method not implemented: initiate');
    }

    /**
     * Validate a payment before execution (e.g., account lookup).
     */
    async validate(params) {
        throw new Error('Method not implemented: validate');
    }

    /**
     * Execute the actual fund movement.
     */
    async execute(params) {
        throw new Error('Method not implemented: execute');
    }

    /**
     * Check status of a transaction.
     */
    async status(reference) {
        throw new Error('Method not implemented: status');
    }

    /**
     * Refund a transaction.
     */
    async refund(params) {
        throw new Error('Method not implemented: refund');
    }
}

export default PaymentServiceInterface;
