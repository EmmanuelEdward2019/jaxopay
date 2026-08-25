import { useCallback, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { LAST_ACTIVE_KEY, INACTIVITY_TIMEOUT_MS, stampActivity } from '../utils/idleSession';

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'wheel'];

// Force-logs-out an authenticated user after 15 minutes of inactivity, mounted once at the app
// root so it covers the dashboard, admin, and any future protected area alike. Two mechanisms:
// 1) a live timer, reset by any real user input, for the tab-stays-open case.
// 2) a visibility check for the tab-was-hidden/backgrounded case — timers throttle or pause on
//    hidden tabs, so we can't trust one to fire on schedule; instead we stamp the moment the tab
//    goes hidden and compare wall-clock time elapsed the instant it becomes visible again.
// App.jsx's boot-time isSessionStale() check covers the third case: the tab/browser fully closed
// and reopened later.
export default function useIdleLogout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const timerRef = useRef(null);

  const scheduleTimeout = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { logout(); }, INACTIVITY_TIMEOUT_MS);
  }, [logout]);

  const resetTimer = useCallback(() => {
    stampActivity();
    scheduleTimeout();
  }, [scheduleTimeout]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    // Arm the countdown only — do NOT stamp here. This effect fires on every mount/reload of an
    // already-authenticated session (page refresh, tab reopen, App.jsx's own staleness check
    // flipping isAuthenticated), including ones App.jsx's boot-time isSessionStale() check hasn't
    // evaluated yet. Stamping "now" here would overwrite the very evidence that check reads,
    // always winning the race since this hook's effect runs before it (declared earlier in App).
    // Only genuine activity (below) or a real login (authStore.js) should move the timestamp.
    scheduleTimeout();
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stampActivity();
        if (timerRef.current) clearTimeout(timerRef.current);
      } else {
        const lastActive = parseInt(localStorage.getItem(LAST_ACTIVE_KEY) || '0', 10);
        if (Date.now() - lastActive >= INACTIVITY_TIMEOUT_MS) {
          logout();
        } else {
          resetTimer();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, resetTimer));
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isAuthenticated, scheduleTimeout, resetTimer, logout]);
}
