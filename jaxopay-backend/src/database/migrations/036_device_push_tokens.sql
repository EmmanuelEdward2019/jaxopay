-- 036_device_push_tokens.sql
--
-- Real OS-level push notifications (sound + notification-tray, works while the app is closed)
-- via Expo's push service. Previously `notifications` only powered an in-app, pull-based bell
-- icon — nothing was ever delivered while the app wasn't open and polling. This table maps a
-- user to the Expo push token(s) of the devices they're logged in on; notification.service.js's
-- notifyUser() sends to every token here whenever it writes an in-app notification row.
--
-- UNIQUE on the token itself (not user_id) so a device that logs into a different account stops
-- receiving the previous account's pushes — registering upserts user_id/platform onto the
-- existing row instead of creating a duplicate.

CREATE TABLE IF NOT EXISTS device_push_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expo_push_token VARCHAR(255) NOT NULL UNIQUE,
    platform VARCHAR(10),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_push_tokens_user_id ON device_push_tokens(user_id);
