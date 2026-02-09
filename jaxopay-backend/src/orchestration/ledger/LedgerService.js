import { query, transaction } from '../../config/database.js';
import { AppError } from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';

class LedgerService {
    /**
     * Records a movement of funds between two entities.
     * Entities can be wallets or external accounts (represented as virtual internal wallets).
     */
    async recordMovement({
        fromWalletId,
        toWalletId,
        amount,
        currency,
        transactionId,
        description,
        metadata = {}
    }, client = null) {
        const execute = async (txClient) => {
            // 1. Get and Lock Wallets
            const fromWallet = await this._getAndLockWallet(txClient, fromWalletId);
            const toWallet = await this._getAndLockWallet(txClient, toWalletId);

            if (parseFloat(fromWallet.balance) < parseFloat(amount)) {
                throw new AppError('Insufficient funds in source wallet', 400);
            }

            // 2. Perform Deductions/Additions
            const newFromBalance = parseFloat(fromWallet.balance) - parseFloat(amount);
            const newToBalance = parseFloat(toWallet.balance) + parseFloat(amount);

            // 3. Update Wallets
            await txClient.query(
                'UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2',
                [newFromBalance, fromWalletId]
            );
            await txClient.query(
                'UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2',
                [newToBalance, toWalletId]
            );

            // 4. Create Ledger Entries (Debit)
            await txClient.query(
                `INSERT INTO wallet_ledger (wallet_id, transaction_id, entry_type, amount, balance_before, balance_after, description, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [fromWalletId, transactionId, 'debit', amount, fromWallet.balance, newFromBalance, description, metadata]
            );

            // 5. Create Ledger Entries (Credit)
            await txClient.query(
                `INSERT INTO wallet_ledger (wallet_id, transaction_id, entry_type, amount, balance_before, balance_after, description, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [toWalletId, transactionId, 'credit', amount, toWallet.balance, newToBalance, description, metadata]
            );

            return {
                fromBalanceAfter: newFromBalance,
                toBalanceAfter: newToBalance
            };
        };

        if (client) {
            return await execute(client);
        } else {
            return await transaction(execute);
        }
    }

    async _getAndLockWallet(client, walletId) {
        const res = await client.query(
            'SELECT id, balance, currency FROM wallets WHERE id = $1 FOR UPDATE',
            [walletId]
        );
        if (res.rows.length === 0) {
            throw new AppError(`Wallet not found: ${walletId}`, 404);
        }
        return res.rows[0];
    }
}

export default new LedgerService();
