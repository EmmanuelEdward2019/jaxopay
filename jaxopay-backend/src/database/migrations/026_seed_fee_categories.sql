-- 026_seed_fee_categories.sql
--
-- Seeds the 6 new fee categories at 0% (is_active=true, currency=NULL i.e. applies to any
-- currency) so the rows exist and are immediately editable from the admin Rates & Fees page.
-- Seeded at 0% deliberately — real markup percentages are a pricing decision for the business
-- to set via that admin UI, not something to invent here. Application code (crypto buy/sell,
-- fiat deposit/withdrawal, YC swap/international transfer) now calls getFeeConfig for each of
-- these, so as soon as a non-zero fee_value is set here it takes effect on the next transaction
-- with no further deploy needed.
INSERT INTO fee_configurations (transaction_type, fee_type, fee_value, min_fee, max_fee, currency, country, is_active) VALUES
  ('swap_buy', 'percentage', 0, 0, 0, NULL, NULL, true),
  ('swap_sell', 'percentage', 0, 0, 0, NULL, NULL, true),
  ('fiat_deposit', 'percentage', 0, 0, 0, NULL, NULL, true),
  ('fiat_withdrawal', 'percentage', 0, 0, 0, NULL, NULL, true),
  ('yc_currency_swap', 'percentage', 0, 0, 0, NULL, NULL, true),
  ('yc_international_transfer', 'percentage', 0, 0, 0, NULL, NULL, true);
