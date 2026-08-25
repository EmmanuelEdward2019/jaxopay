// Shared by App.jsx (cold-start staleness check) and useIdleLogout (live idle timer) so both
// sides of the inactivity-logout feature agree on the same key/threshold.
export const LAST_ACTIVE_KEY = 'jaxopay-last-active';
export const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

export const stampActivity = () => {
  localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
};

// No timestamp at all (e.g. a session persisted before this feature existed) is treated as
// stale too — funds are on the line, so an unrecognized session errs toward forcing a fresh
// login rather than trusting it.
export const isSessionStale = () => {
  const lastActive = parseInt(localStorage.getItem(LAST_ACTIVE_KEY) || '0', 10);
  return Date.now() - lastActive >= INACTIVITY_TIMEOUT_MS;
};
