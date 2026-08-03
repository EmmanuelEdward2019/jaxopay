-- 011_rls_write_lockdown.sql
-- SECURITY FIX: every "ALL"-command RLS policy (55 total) allowed the anon/authenticated
-- Supabase roles to INSERT/UPDATE/DELETE directly via PostgREST, gated only by row
-- ownership or is_admin() -- with NO column-level restriction. This let a self-registered
-- user PATCH their own users row (including "role") directly, bypassing the Express API
-- entirely (no audit trail). The Express backend's own connection uses the RLS-bypassing
-- "postgres" role for all real writes, and no client uses the Supabase SDK to write --
-- so removing write access here is pure hardening with no functional impact.
-- Read access (SELECT) is fully preserved with the exact same USING clause as before.

BEGIN;

-- Two tables were found with RLS disabled entirely (no protection at all against the
-- anon/authenticated PostgREST path): password_resets holds live password-reset tokens
-- (an account-takeover vector if directly readable) and account_deletion_requests was
-- created via a raw migration that never enabled RLS the way Supabase's dashboard does by
-- default. Neither needs any anon/authenticated policy -- only the backend's own
-- RLS-bypassing connection ever touches them -- so enabling RLS with zero policies here is
-- correct: it makes both tables fully inaccessible via direct REST (default-deny).
ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_audit_logs_admin_policy" ON public.admin_audit_logs;
CREATE POLICY "admin_audit_logs_admin_policy" ON public.admin_audit_logs FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "aml_risk_scores_admin_policy" ON public.aml_risk_scores;
CREATE POLICY "aml_risk_scores_admin_policy" ON public.aml_risk_scores FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "announcements_admin_policy" ON public.announcements;
CREATE POLICY "announcements_admin_policy" ON public.announcements FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "admin_access_all" ON public.audit_logs;
CREATE POLICY "admin_access_all" ON public.audit_logs FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role, 'compliance_officer'::user_role]))))));

DROP POLICY IF EXISTS "audit_logs_admin_policy" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_policy" ON public.audit_logs FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "beneficiaries_admin_policy" ON public.beneficiaries;
CREATE POLICY "beneficiaries_admin_policy" ON public.beneficiaries FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "beneficiaries_owner" ON public.beneficiaries;
CREATE POLICY "beneficiaries_owner" ON public.beneficiaries FOR SELECT TO public USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "bill_payment_providers_admin_policy" ON public.bill_payment_providers;
CREATE POLICY "bill_payment_providers_admin_policy" ON public.bill_payment_providers FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "bill_payments_admin_policy" ON public.bill_payments;
CREATE POLICY "bill_payments_admin_policy" ON public.bill_payments FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "card_transactions_admin_policy" ON public.card_transactions;
CREATE POLICY "card_transactions_admin_policy" ON public.card_transactions FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "card_tx_owner_all" ON public.card_transactions;
CREATE POLICY "card_tx_owner_all" ON public.card_transactions FOR SELECT TO public USING ((auth.uid() = ( SELECT virtual_cards.user_id
   FROM virtual_cards
  WHERE (virtual_cards.id = card_transactions.card_id))));

DROP POLICY IF EXISTS "crypto_exchanges_admin_policy" ON public.crypto_exchanges;
CREATE POLICY "crypto_exchanges_admin_policy" ON public.crypto_exchanges FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "email_verifications_admin_policy" ON public.email_verifications;
CREATE POLICY "email_verifications_admin_policy" ON public.email_verifications FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "exchange_rates_admin_policy" ON public.exchange_rates;
CREATE POLICY "exchange_rates_admin_policy" ON public.exchange_rates FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "feature_toggles_admin_policy" ON public.feature_toggles;
CREATE POLICY "feature_toggles_admin_policy" ON public.feature_toggles FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "fee_configurations_admin_policy" ON public.fee_configurations;
CREATE POLICY "fee_configurations_admin_policy" ON public.fee_configurations FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "flight_bookings_admin_policy" ON public.flight_bookings;
CREATE POLICY "flight_bookings_admin_policy" ON public.flight_bookings FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "gift_card_disputes_admin_policy" ON public.gift_card_disputes;
CREATE POLICY "gift_card_disputes_admin_policy" ON public.gift_card_disputes FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "gift_card_products_admin_policy" ON public.gift_card_products;
CREATE POLICY "gift_card_products_admin_policy" ON public.gift_card_products FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "gift_card_purchases_admin_policy" ON public.gift_card_purchases;
CREATE POLICY "gift_card_purchases_admin_policy" ON public.gift_card_purchases FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "gift_card_sales_admin_policy" ON public.gift_card_sales;
CREATE POLICY "gift_card_sales_admin_policy" ON public.gift_card_sales FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "gift_cards_admin_policy" ON public.gift_cards;
CREATE POLICY "gift_cards_admin_policy" ON public.gift_cards FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "idempotency_keys_admin_policy" ON public.idempotency_keys;
CREATE POLICY "idempotency_keys_admin_policy" ON public.idempotency_keys FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "kyc_documents_admin_policy" ON public.kyc_documents;
CREATE POLICY "kyc_documents_admin_policy" ON public.kyc_documents FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "kyc_owner_all" ON public.kyc_documents;
CREATE POLICY "kyc_owner_all" ON public.kyc_documents FOR SELECT TO public USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "notification_preferences_admin_policy" ON public.notification_preferences;
CREATE POLICY "notification_preferences_admin_policy" ON public.notification_preferences FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "notifications_admin_policy" ON public.notifications;
CREATE POLICY "notifications_admin_policy" ON public.notifications FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "notifications_owner_all" ON public.notifications;
CREATE POLICY "notifications_owner_all" ON public.notifications FOR SELECT TO public USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "otp_codes_admin_policy" ON public.otp_codes;
CREATE POLICY "otp_codes_admin_policy" ON public.otp_codes FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "password_reset_tokens_admin_policy" ON public.password_reset_tokens;
CREATE POLICY "password_reset_tokens_admin_policy" ON public.password_reset_tokens FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "sanctions_screening_admin_policy" ON public.sanctions_screening;
CREATE POLICY "sanctions_screening_admin_policy" ON public.sanctions_screening FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "sms_batches_admin_policy" ON public.sms_batches;
CREATE POLICY "sms_batches_admin_policy" ON public.sms_batches FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "support_tickets_admin_policy" ON public.support_tickets;
CREATE POLICY "support_tickets_admin_policy" ON public.support_tickets FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "tickets_owner_all" ON public.support_tickets;
CREATE POLICY "tickets_owner_all" ON public.support_tickets FOR SELECT TO public USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "messages_owner_all" ON public.ticket_messages;
CREATE POLICY "messages_owner_all" ON public.ticket_messages FOR SELECT TO public USING ((auth.uid() = ( SELECT support_tickets.user_id
   FROM support_tickets
  WHERE (support_tickets.id = ticket_messages.ticket_id))));

DROP POLICY IF EXISTS "ticket_messages_admin_policy" ON public.ticket_messages;
CREATE POLICY "ticket_messages_admin_policy" ON public.ticket_messages FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "totp_secrets_admin_policy" ON public.totp_secrets;
CREATE POLICY "totp_secrets_admin_policy" ON public.totp_secrets FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "transactions_admin_policy" ON public.transactions;
CREATE POLICY "transactions_admin_policy" ON public.transactions FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "transactions_owner_all" ON public.transactions;
CREATE POLICY "transactions_owner_all" ON public.transactions FOR SELECT TO public USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "user_devices_admin_policy" ON public.user_devices;
CREATE POLICY "user_devices_admin_policy" ON public.user_devices FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "user_feature_access_admin_policy" ON public.user_feature_access;
CREATE POLICY "user_feature_access_admin_policy" ON public.user_feature_access FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "user_gift_cards_admin_policy" ON public.user_gift_cards;
CREATE POLICY "user_gift_cards_admin_policy" ON public.user_gift_cards FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "profiles_owner_all" ON public.user_profiles;
CREATE POLICY "profiles_owner_all" ON public.user_profiles FOR SELECT TO public USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "user_profiles_admin_policy" ON public.user_profiles;
CREATE POLICY "user_profiles_admin_policy" ON public.user_profiles FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "user_sessions_admin_policy" ON public.user_sessions;
CREATE POLICY "user_sessions_admin_policy" ON public.user_sessions FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "users_admin_policy" ON public.users;
CREATE POLICY "users_admin_policy" ON public.users FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "users_owner_all" ON public.users;
CREATE POLICY "users_owner_all" ON public.users FOR SELECT TO public USING ((auth.uid() = id));

DROP POLICY IF EXISTS "cards_owner_all" ON public.virtual_cards;
CREATE POLICY "cards_owner_all" ON public.virtual_cards FOR SELECT TO public USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "virtual_cards_admin_policy" ON public.virtual_cards;
CREATE POLICY "virtual_cards_admin_policy" ON public.virtual_cards FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "wallet_ledger_admin_policy" ON public.wallet_ledger;
CREATE POLICY "wallet_ledger_admin_policy" ON public.wallet_ledger FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "wallet_ledger_owner_all" ON public.wallet_ledger;
CREATE POLICY "wallet_ledger_owner_all" ON public.wallet_ledger FOR SELECT TO public USING ((auth.uid() = ( SELECT wallets.user_id
   FROM wallets
  WHERE (wallets.id = wallet_ledger.wallet_id))));

DROP POLICY IF EXISTS "wallet_transactions_admin_policy" ON public.wallet_transactions;
CREATE POLICY "wallet_transactions_admin_policy" ON public.wallet_transactions FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "wallets_admin_policy" ON public.wallets;
CREATE POLICY "wallets_admin_policy" ON public.wallets FOR SELECT TO public USING (is_admin());

DROP POLICY IF EXISTS "wallets_owner_all" ON public.wallets;
CREATE POLICY "wallets_owner_all" ON public.wallets FOR SELECT TO public USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "webhooks_admin_policy" ON public.webhooks;
CREATE POLICY "webhooks_admin_policy" ON public.webhooks FOR SELECT TO public USING (is_admin());

COMMIT;
