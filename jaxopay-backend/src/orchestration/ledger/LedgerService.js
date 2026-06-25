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

    /**
     * Record a completed fiat deposit as double-entry ledger rows AND bump the matching
     * system float account. External money entering the platform increases both an asset
     * (provider float) and a liability (the user's wallet), so both legs are credits.
     *
     * IMPORTANT: call this AFTER the user wallet has already been credited and the deposit
     * transaction has committed — it runs in its own transaction and is meant to be invoked
     * non-fatally (.catch). It only writes ledger rows + the system float balance; it never
     * touches the user's wallet balance, so it can't double-credit or break a deposit.
     */
    async recordDepositEntries({ userWalletId, amount, transactionId = null, description = 'Deposit', metadata = {} }) {
        const amt = parseFloat(amount);
        if (!userWalletId || !Number.isFinite(amt) || amt <= 0) return null;

        return await transaction(async (client) => {
            // User wallet — balance already includes this deposit (credited by the caller).
            const userWallet = await this._getAndLockWallet(client, userWalletId);
            const userAfter = parseFloat(userWallet.balance);
            const userBefore = userAfter - amt;

            await client.query(
                `INSERT INTO wallet_ledger (wallet_id, transaction_id, entry_type, amount, balance_before, balance_after, description, metadata)
                 VALUES ($1, $2, 'credit', $3, $4, $5, $6, $7)`,
                [userWalletId, transactionId, amt, userBefore, userAfter, description, JSON.stringify(metadata)]
            );

            // Matching system float account for the same currency (provider float increases).
            const sys = await client.query(
                `SELECT id, balance FROM wallets
                 WHERE wallet_type::text = 'system' AND UPPER(currency::text) = UPPER($1)
                 LIMIT 1 FOR UPDATE`,
                [userWallet.currency]
            );
            if (sys.rows.length > 0) {
                const floatBefore = parseFloat(sys.rows[0].balance);
                const floatAfter = floatBefore + amt;
                await client.query(
                    'UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2',
                    [floatAfter, sys.rows[0].id]
                );
                await client.query(
                    `INSERT INTO wallet_ledger (wallet_id, transaction_id, entry_type, amount, balance_before, balance_after, description, metadata)
                     VALUES ($1, $2, 'credit', $3, $4, $5, $6, $7)`,
                    [sys.rows[0].id, transactionId, amt, floatBefore, floatAfter, `Float received — ${description}`, JSON.stringify(metadata)]
                );
            }
            return { recorded: true, hasSystemLeg: sys.rows.length > 0 };
        });
    }
}

export default new LedgerService();
