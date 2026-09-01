-- 041_wallets_crypto_network.sql
--
-- Records which network a user's crypto deposit address was generated for (e.g. 'BSC',
-- 'ARBITRUM', 'TRC20'). Never persisted before — getCryptoDepositAddress received a `network`
-- param but only used it in the provider API call, never stored it. Needed so a deposit's
-- transaction-detail receipt can show which network a deposit arrived on: the Obiex deposit
-- webhook itself doesn't carry a `network` field (confirmed against their docs — only the
-- withdrawal webhook does), so the only reliable source is the address's own known network.
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS crypto_network VARCHAR(50);
