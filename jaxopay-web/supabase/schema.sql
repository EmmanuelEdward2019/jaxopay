-- JAXOPAY Database Schema
-- Production-grade cross-border fintech platform

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE user_role AS ENUM ('end_user', 'admin', 'super_admin', 'compliance_officer');
CREATE TYPE kyc_tier AS ENUM ('tier_0', 'tier_1', 'tier_2');
CREATE TYPE kyc_status AS ENUM ('pending', 'approved', 'rejected', 'under_review');
CREATE TYPE wallet_type AS ENUM ('fiat', 'crypto');
CREATE TYPE currency_code AS ENUM (
  'NGN', 'GHS', 'KES', 'ZAR', 'USD', 'GBP', 'CAD', 'CNY',
  'USDT', 'BTC', 'ETH', 'USDC'
);
CREATE TYPE transaction_type AS ENUM (
  'deposit', 'withdrawal', 'transfer', 'exchange', 'payment', 
  'card_funding', 'card_transaction', 'bill_payment', 'flight_booking', 
  'gift_card_purchase', 'gift_card_sale', 'refund', 'fee'
);
CREATE TYPE transaction_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled', 'reversed');
CREATE TYPE card_status AS ENUM ('active', 'frozen', 'terminated');
CREATE TYPE payment_method AS ENUM ('bank_transfer', 'card', 'crypto', 'wallet', 'mobile_money');
CREATE TYPE two_fa_method AS ENUM ('sms', 'email', 'authenticator');
CREATE TYPE feature_toggle AS ENUM (
  'crypto', 'virtual_cards', 'gift_cards', 'flights', 'utilities', 
  'cross_border', 'bill_payments', 'wallet_transfers', 'bulk_sms'
);

-- ============================================
-- CORE USER TABLES
-- ============================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50) UNIQUE,
  password_hash TEXT NOT NULL,
  role user_role DEFAULT 'end_user',
  kyc_tier kyc_tier DEFAULT 'tier_0',
  kyc_status kyc_status DEFAULT 'pending',
  is_active BOOLEAN DEFAULT true,
  is_email_verified BOOLEAN DEFAULT false,
  is_phone_verified BOOLEAN DEFAULT false,
  two_fa_enabled BOOLEAN DEFAULT false,
  two_fa_method two_fa_method,
  country_code VARCHAR(2),
  preferred_language VARCHAR(10) DEFAULT 'en',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  middle_name VARCHAR(100),
  date_of_birth DATE,
  gender VARCHAR(20),
  address_line1 TEXT,
  address_line2 TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  country VARCHAR(2),
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,
  device_fingerprint TEXT,
  ip_address INET,
  user_agent TEXT,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE user_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  device_fingerprint TEXT NOT NULL,
  device_name VARCHAR(255),
  device_type VARCHAR(50),
  os VARCHAR(100),
  browser VARCHAR(100),
  ip_address INET,
  is_trusted BOOLEAN DEFAULT false,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- KYC & COMPLIANCE
-- ============================================

CREATE TABLE kyc_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  document_type VARCHAR(50) NOT NULL, -- 'id_card', 'passport', 'drivers_license', 'proof_of_address'
  document_number VARCHAR(100),
  document_url TEXT NOT NULL,
  selfie_url TEXT,
  status kyc_status DEFAULT 'pending',
  tier kyc_tier NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES users(id),
  rejection_reason TEXT,
  expiry_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE aml_risk_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  risk_score INTEGER CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_level VARCHAR(20), -- 'low', 'medium', 'high', 'critical'
  factors JSONB, -- Store risk factors as JSON
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE sanctions_screening (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  screening_result VARCHAR(20), -- 'clear', 'match', 'potential_match'
  matched_lists TEXT[], -- Array of matched sanction lists
  screening_data JSONB,
  screened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- WALLET SYSTEM
-- ============================================

CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  wallet_type wallet_type NOT NULL,
  currency currency_code NOT NULL,
  balance DECIMAL(20, 8) DEFAULT 0 CHECK (balance >= 0),
  available_balance DECIMAL(20, 8) DEFAULT 0 CHECK (available_balance >= 0),
  locked_balance DECIMAL(20, 8) DEFAULT 0 CHECK (locked_balance >= 0),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, currency)
);

CREATE TABLE wallet_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE,
  transaction_id UUID,
  entry_type VARCHAR(20) NOT NULL, -- 'debit', 'credit'
  amount DECIMAL(20, 8) NOT NULL,
  balance_before DECIMAL(20, 8) NOT NULL,
  balance_after DECIMAL(20, 8) NOT NULL,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- TRANSACTIONS
-- ============================================

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  transaction_type transaction_type NOT NULL,
  status transaction_status DEFAULT 'pending',
  from_wallet_id UUID REFERENCES wallets(id),
  to_wallet_id UUID REFERENCES wallets(id),
  from_currency currency_code,
  to_currency currency_code,
  from_amount DECIMAL(20, 8),
  to_amount DECIMAL(20, 8),
  exchange_rate DECIMAL(20, 8),
  fee_amount DECIMAL(20, 8) DEFAULT 0,
  fee_currency currency_code,
  net_amount DECIMAL(20, 8),
  reference VARCHAR(100) UNIQUE NOT NULL,
  external_reference VARCHAR(255),
  description TEXT,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  initiated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  failure_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE beneficiaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  beneficiary_type VARCHAR(50) NOT NULL, -- 'bank_account', 'mobile_money', 'crypto_wallet', 'internal_user'
  name VARCHAR(255) NOT NULL,
  account_number VARCHAR(100),
  bank_code VARCHAR(50),
  bank_name VARCHAR(255),
  mobile_number VARCHAR(50),
  crypto_address TEXT,
  currency currency_code NOT NULL,
  country VARCHAR(2),
  is_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- CRYPTO EXCHANGE
-- ============================================

CREATE TABLE crypto_exchanges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  exchange_type VARCHAR(20) NOT NULL, -- 'fiat_to_crypto', 'crypto_to_fiat', 'crypto_to_crypto'
  from_currency currency_code NOT NULL,
  to_currency currency_code NOT NULL,
  from_amount DECIMAL(20, 8) NOT NULL,
  to_amount DECIMAL(20, 8) NOT NULL,
  exchange_rate DECIMAL(20, 8) NOT NULL,
  slippage_percentage DECIMAL(5, 2),
  blockchain_network VARCHAR(50),
  blockchain_tx_hash VARCHAR(255),
  blockchain_confirmations INTEGER DEFAULT 0,
  required_confirmations INTEGER DEFAULT 3,
  provider VARCHAR(100),
  provider_reference VARCHAR(255),
  status transaction_status DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE exchange_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_currency currency_code NOT NULL,
  to_currency currency_code NOT NULL,
  rate DECIMAL(20, 8) NOT NULL,
  markup_percentage DECIMAL(5, 2) DEFAULT 0,
  final_rate DECIMAL(20, 8) NOT NULL,
  source VARCHAR(100), -- 'provider_api', 'manual', 'aggregated'
  valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  valid_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(from_currency, to_currency, valid_from)
);

-- ============================================
-- VIRTUAL CARDS
-- ============================================

CREATE TABLE virtual_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  card_number_encrypted TEXT NOT NULL,
  card_last_four VARCHAR(4) NOT NULL,
  cvv_encrypted TEXT NOT NULL,
  expiry_month INTEGER NOT NULL CHECK (expiry_month >= 1 AND expiry_month <= 12),
  expiry_year INTEGER NOT NULL,
  cardholder_name VARCHAR(255) NOT NULL,
  card_type VARCHAR(50) DEFAULT 'virtual_usd',
  status card_status DEFAULT 'active',
  balance DECIMAL(20, 8) DEFAULT 0 CHECK (balance >= 0),
  spending_limit_daily DECIMAL(20, 8),
  spending_limit_monthly DECIMAL(20, 8),
  spent_today DECIMAL(20, 8) DEFAULT 0,
  spent_this_month DECIMAL(20, 8) DEFAULT 0,
  provider VARCHAR(100),
  provider_card_id VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  frozen_at TIMESTAMP WITH TIME ZONE,
  terminated_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE card_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id UUID REFERENCES virtual_cards(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id),
  merchant_name VARCHAR(255),
  merchant_category VARCHAR(100),
  amount DECIMAL(20, 8) NOT NULL,
  currency currency_code NOT NULL,
  status transaction_status DEFAULT 'pending',
  authorization_code VARCHAR(100),
  provider_reference VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- BILL PAYMENTS & UTILITIES
-- ============================================

CREATE TABLE bill_payment_providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_name VARCHAR(255) NOT NULL,
  provider_code VARCHAR(100) UNIQUE NOT NULL,
  service_type VARCHAR(50) NOT NULL, -- 'electricity', 'water', 'cable_tv', 'internet', 'airtime', 'data', 'education'
  country VARCHAR(2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  api_config JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE bill_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES bill_payment_providers(id),
  service_type VARCHAR(50) NOT NULL,
  account_number VARCHAR(100) NOT NULL,
  customer_name VARCHAR(255),
  amount DECIMAL(20, 8) NOT NULL,
  currency currency_code NOT NULL,
  status transaction_status DEFAULT 'pending',
  provider_reference VARCHAR(255),
  receipt_number VARCHAR(255),
  receipt_url TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- FLIGHT BOOKINGS
-- ============================================

CREATE TABLE flight_bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  booking_reference VARCHAR(100) UNIQUE NOT NULL,
  pnr VARCHAR(50),
  airline_code VARCHAR(10),
  airline_name VARCHAR(255),
  flight_number VARCHAR(20),
  departure_airport VARCHAR(10),
  arrival_airport VARCHAR(10),
  departure_date TIMESTAMP WITH TIME ZONE,
  arrival_date TIMESTAMP WITH TIME ZONE,
  passenger_details JSONB NOT NULL,
  total_amount DECIMAL(20, 8) NOT NULL,
  currency currency_code NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'confirmed', 'ticketed', 'cancelled'
  ticket_urls TEXT[],
  provider VARCHAR(100),
  provider_reference VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  cancelled_at TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- GIFT CARDS
-- ============================================

CREATE TABLE gift_card_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_name VARCHAR(255) NOT NULL,
  product_code VARCHAR(100) UNIQUE NOT NULL,
  brand VARCHAR(100) NOT NULL, -- 'Amazon', 'Apple', 'Google Play', 'Steam', 'Netflix'
  country VARCHAR(2),
  currency currency_code NOT NULL,
  denominations DECIMAL(20, 2)[], -- Available denominations
  min_amount DECIMAL(20, 2),
  max_amount DECIMAL(20, 2),
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  provider VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE gift_card_purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID REFERENCES gift_card_products(id),
  quantity INTEGER DEFAULT 1,
  unit_price DECIMAL(20, 8) NOT NULL,
  total_amount DECIMAL(20, 8) NOT NULL,
  currency currency_code NOT NULL,
  status transaction_status DEFAULT 'pending',
  card_codes TEXT[], -- Encrypted gift card codes
  card_pins TEXT[], -- Encrypted PINs if applicable
  provider_reference VARCHAR(255),
  delivered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE gift_card_sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID REFERENCES gift_card_products(id),
  card_code_encrypted TEXT NOT NULL,
  card_pin_encrypted TEXT,
  card_value DECIMAL(20, 8) NOT NULL,
  asking_price DECIMAL(20, 8) NOT NULL,
  currency currency_code NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'under_review', 'approved', 'rejected', 'sold', 'cancelled'
  verification_images TEXT[],
  buyer_id UUID REFERENCES users(id),
  sold_at TIMESTAMP WITH TIME ZONE,
  payout_transaction_id UUID REFERENCES transactions(id),
  rejection_reason TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE gift_card_disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID REFERENCES gift_card_sales(id) ON DELETE CASCADE,
  purchase_id UUID REFERENCES gift_card_purchases(id) ON DELETE CASCADE,
  raised_by UUID REFERENCES users(id) ON DELETE CASCADE,
  dispute_type VARCHAR(50) NOT NULL, -- 'invalid_code', 'already_used', 'wrong_value', 'other'
  description TEXT NOT NULL,
  evidence_urls TEXT[],
  status VARCHAR(50) DEFAULT 'open', -- 'open', 'investigating', 'resolved', 'closed'
  resolution TEXT,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ADMIN & CONFIGURATION
-- ============================================

CREATE TABLE feature_toggles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  feature_name feature_toggle NOT NULL UNIQUE,
  is_enabled BOOLEAN DEFAULT true,
  enabled_countries VARCHAR(2)[],
  disabled_countries VARCHAR(2)[],
  config JSONB,
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE fee_configurations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_type transaction_type NOT NULL,
  fee_type VARCHAR(50) NOT NULL, -- 'fixed', 'percentage', 'tiered'
  fee_value DECIMAL(20, 8) NOT NULL,
  min_fee DECIMAL(20, 8),
  max_fee DECIMAL(20, 8),
  currency currency_code,
  country VARCHAR(2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  url TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  response_code INTEGER,
  response_body TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  email_notifications BOOLEAN DEFAULT true,
  sms_notifications BOOLEAN DEFAULT true,
  push_notifications BOOLEAN DEFAULT true,
  transaction_alerts BOOLEAN DEFAULT true,
  marketing_emails BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_kyc_status ON users(kyc_status);
CREATE INDEX idx_users_created_at ON users(created_at);

-- Wallets
CREATE INDEX idx_wallets_user_id ON wallets(user_id);
CREATE INDEX idx_wallets_currency ON wallets(currency);
CREATE INDEX idx_wallets_user_currency ON wallets(user_id, currency);

-- Transactions
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
CREATE INDEX idx_transactions_reference ON transactions(reference);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_transactions_user_status ON transactions(user_id, status);

-- Wallet Ledger
CREATE INDEX idx_wallet_ledger_wallet_id ON wallet_ledger(wallet_id);
CREATE INDEX idx_wallet_ledger_transaction_id ON wallet_ledger(transaction_id);
CREATE INDEX idx_wallet_ledger_created_at ON wallet_ledger(created_at);

-- Virtual Cards
CREATE INDEX idx_virtual_cards_user_id ON virtual_cards(user_id);
CREATE INDEX idx_virtual_cards_status ON virtual_cards(status);

-- Sessions
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Audit Logs
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================
-- TRIGGERS & FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_virtual_cards_updated_at BEFORE UPDATE ON virtual_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate transaction reference
CREATE OR REPLACE FUNCTION generate_transaction_reference()
RETURNS TEXT AS $$
BEGIN
  RETURN 'TXN-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 10));
END;
$$ LANGUAGE plpgsql;

-- Function to validate wallet balance before transaction
CREATE OR REPLACE FUNCTION validate_wallet_balance()
RETURNS TRIGGER AS $$
DECLARE
  current_balance DECIMAL(20, 8);
BEGIN
  SELECT balance INTO current_balance FROM wallets WHERE id = NEW.from_wallet_id;

  IF current_balance < NEW.from_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on sensitive tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE virtual_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_documents ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY users_select_own ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY user_profiles_select_own ON user_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY wallets_select_own ON wallets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY transactions_select_own ON transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY virtual_cards_select_own ON virtual_cards
  FOR SELECT USING (auth.uid() = user_id);

-- Admins can see all data
CREATE POLICY users_admin_all ON users
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'compliance_officer')
    )
  );

-- ============================================
-- INITIAL DATA
-- ============================================

-- Insert default feature toggles
INSERT INTO feature_toggles (feature_name, is_enabled) VALUES
  ('crypto', true),
  ('virtual_cards', true),
  ('gift_cards', true),
  ('flights', true),
  ('utilities', true),
  ('cross_border', true),
  ('bill_payments', true),
  ('wallet_transfers', true)
ON CONFLICT (feature_name) DO NOTHING;

-- Insert default exchange rate sources
-- (Rates should be updated via API in production)

COMMENT ON TABLE users IS 'Core user accounts with authentication and role information';
COMMENT ON TABLE wallets IS 'Multi-currency wallet system with ledger-based accounting';
COMMENT ON TABLE transactions IS 'All financial transactions across the platform';
COMMENT ON TABLE virtual_cards IS 'Virtual USD card issuance and management';
COMMENT ON TABLE kyc_documents IS 'KYC document storage and verification tracking';
COMMENT ON TABLE aml_risk_scores IS 'AML risk scoring and monitoring';
COMMENT ON TABLE gift_card_sales IS 'Peer-to-peer gift card marketplace';
COMMENT ON TABLE audit_logs IS 'Complete audit trail for compliance and security';


