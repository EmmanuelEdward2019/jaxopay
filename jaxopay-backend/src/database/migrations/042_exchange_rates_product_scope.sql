-- Scope exchange_rates rows to the product whose pricing they drive.
--
-- Until now every row in this table existed for exactly one purpose: the Obiex/Quidax crypto swap
-- markup (swapMarkup.service.js). Yellow Card's Currency Swap and International Transfer are now
-- moving off the flat fee_configurations fee and onto the same base-rate + markup model, and they
-- need their own independently-configurable rows — a NGN->USD pair can reasonably carry a
-- different margin as a currency swap than as a cross-border payout, and the same currency codes
-- could legitimately appear under more than one product.
--
-- Existing rows all become 'crypto_swap', which is what they already are. swapMarkup.service.js's
-- two queries are scoped to that value in the same change, so crypto swap pricing is unaffected.
ALTER TABLE exchange_rates
  ADD COLUMN IF NOT EXISTS product VARCHAR(30) NOT NULL DEFAULT 'crypto_swap';

-- The uniqueness that matters is now per-product, not per currency pair.
CREATE INDEX IF NOT EXISTS idx_exchange_rates_product_pair
  ON exchange_rates (product, from_currency, to_currency);

-- The two Yellow Card fee rows these products used to read are now dead: nothing calls
-- getFeeConfig('yc_currency_swap'|'yc_international_transfer') after this change, because the
-- margin is baked into the rate instead. Deactivated rather than deleted so the historical
-- configuration stays auditable. yc_payment_collection is deliberately untouched — that product
-- has no customer-facing exchange rate to bake a markup into (same currency in and out), so it
-- stays fee-based.
UPDATE fee_configurations
   SET is_active = false
 WHERE transaction_type IN ('yc_currency_swap', 'yc_international_transfer');
