-- JAXOPAY Seed Data — LOCAL DEV ONLY. Never run against staging/production.
-- Use this file to populate the database with test data

-- Note: Run this after migrations have been applied

-- Create admin user — password_hash below is a placeholder, not a real hash. Generate a
-- fresh bcrypt hash of your own strong local password before running this (never reuse a
-- documented/example password — even for a throwaway local dev database).
INSERT INTO users (id, email, password_hash, role, kyc_tier, is_active, is_email_verified, created_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'admin@jaxopay.com',
  '$2a$10$YourHashedPasswordHere', -- Replace with your own bcrypt hash
  'admin',
  3,
  true,
  true,
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- Create admin profile
INSERT INTO user_profiles (user_id, first_name, last_name, created_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'System',
  'Administrator',
  NOW()
)
ON CONFLICT (user_id) DO NOTHING;

-- Create test user
INSERT INTO users (id, email, password_hash, role, kyc_tier, is_active, is_email_verified, created_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440001',
  'test@example.com',
  '$2a$10$YourHashedPasswordHere', -- Replace with your own bcrypt hash
  'user',
  1,
  true,
  true,
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- Create test user profile
INSERT INTO user_profiles (user_id, first_name, last_name, phone, created_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440001',
  'Test',
  'User',
  '+2348012345678',
  NOW()
)
ON CONFLICT (user_id) DO NOTHING;

-- Create test user wallets
INSERT INTO wallets (user_id, currency, wallet_type, balance, available_balance, created_at)
VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'NGN', 'fiat', 100000.00, 100000.00, NOW()),
  ('550e8400-e29b-41d4-a716-446655440001', 'USD', 'fiat', 1000.00, 1000.00, NOW()),
  ('550e8400-e29b-41d4-a716-446655440001', 'USDT', 'crypto', 500.00, 500.00, NOW()),
  ('550e8400-e29b-41d4-a716-446655440001', 'BTC', 'crypto', 0.05, 0.05, NOW())
ON CONFLICT (user_id, currency) DO NOTHING;

-- Insert seed completed
SELECT 'Seed data inserted successfully' AS result;
