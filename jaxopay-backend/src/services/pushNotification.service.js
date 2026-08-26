import { query } from '../config/database.js';
import logger from '../utils/logger.js';

// expo-server-sdk is loaded lazily, NOT via a top-level import — its ExpoClient.js does
// `import packageJson from '../package.json' with { type: 'json' }`, import-attribute syntax
// only Node.js 20.10+ parses. A top-level import crashed the ENTIRE backend on boot on this
// project's Node 18 droplet (SyntaxError: Unexpected token 'with', thrown before any app code
// runs) — took down login and every other route, not just push notifications. A dynamic
// import() only evaluates (and can fail) when actually awaited, so a Node 18 environment can
// still boot everything else; only an actual push-send attempt fails, caught below same as any
// other push-provider error.
let _expoPromise = null;
function loadExpo() {
  if (!_expoPromise) {
    // EXPO_ACCESS_TOKEN is optional — Expo's push API works without one, it just raises rate
    // limits / lets Expo attribute requests to this project. Undefined is a valid Expo() arg.
    _expoPromise = import('expo-server-sdk').then(({ Expo }) => ({
      Expo,
      instance: new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN }),
    }));
  }
  return _expoPromise;
}

/**
 * Registers (or re-homes) a device's Expo push token to a user. UNIQUE(expo_push_token) means a
 * device that logs into a different account moves its token to the new user instead of leaving
 * a stale row that would page the previous account.
 */
export async function registerDeviceToken(userId, { expoPushToken, platform }) {
  await query(
    `INSERT INTO device_push_tokens (user_id, expo_push_token, platform, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (expo_push_token)
     DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, updated_at = NOW()`,
    [userId, expoPushToken, platform || null]
  );
}

export async function unregisterDeviceToken(expoPushToken) {
  await query('DELETE FROM device_push_tokens WHERE expo_push_token = $1', [expoPushToken]);
}

/**
 * Sends a push notification (sound + notification-tray, works while the app is closed) to every
 * device a user is registered on. Never throws — same contract as notification.service.js's
 * notifyUser(), which is this function's only caller: a push failing to send must never break
 * the underlying transaction/action it's describing.
 */
export async function sendPushToUser(userId, { title, body, data }) {
  try {
    const { rows } = await query(
      'SELECT expo_push_token FROM device_push_tokens WHERE user_id = $1',
      [userId]
    );
    if (rows.length === 0) return;

    const { Expo, instance: expo } = await loadExpo();

    const messages = [];
    const staleTokens = [];
    for (const { expo_push_token: token } of rows) {
      if (!Expo.isExpoPushToken(token)) {
        staleTokens.push(token);
        continue;
      }
      messages.push({ to: token, sound: 'default', title, body, data: data || {} });
    }
    if (staleTokens.length > 0) {
      await query('DELETE FROM device_push_tokens WHERE expo_push_token = ANY($1)', [staleTokens]);
    }
    if (messages.length === 0) return;

    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];
    for (const chunk of chunks) {
      try {
        tickets.push(...await expo.sendPushNotificationsAsync(chunk));
      } catch (err) {
        logger.error(`[Push] Failed to send chunk for user ${userId}: ${err.message}`);
      }
    }

    // A ticket's real delivery outcome (including DeviceNotRegistered — uninstalled app, expired
    // token) only shows up in a separate receipt fetched later, not the ticket itself; an
    // immediate 'error' status is already actionable synchronously.
    const deadTokens = [];
    tickets.forEach((ticket, i) => {
      if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
        deadTokens.push(messages[i].to);
      }
    });
    if (deadTokens.length > 0) {
      await query('DELETE FROM device_push_tokens WHERE expo_push_token = ANY($1)', [deadTokens]);
    }
  } catch (err) {
    logger.error(`[Push] sendPushToUser failed for ${userId}: ${err.message}`);
  }
}
