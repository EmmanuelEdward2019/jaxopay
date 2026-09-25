import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Makes #anchor links work in this SPA.
 *
 * On a cold load of /page#section the browser looks for the element while React has rendered
 * nothing yet, finds no match, and never tries again — so the visitor lands at the top of the page
 * with no indication anything was missed. (jaxopay.com/delete-account#request-your-data, the URL
 * given to Google Play for data-deletion requests, is exactly this case.)
 *
 * So retry until the element actually exists, rather than assuming it is there on the first frame.
 * Sections below data that loads after mount can appear late, hence a window rather than a single
 * retry; it gives up quietly if the id never shows up.
 *
 * Vertical offset for the fixed header comes from CSS `scroll-margin-top` on the target
 * (Tailwind's `scroll-mt-*`), which scrollIntoView honours, so it is not hard-coded here.
 */
const GIVE_UP_AFTER_MS = 3000;
const RETRY_EVERY_MS = 100;

export default function ScrollToHash() {
  const { hash, pathname } = useLocation();

  useEffect(() => {
    if (!hash) return undefined;

    const id = decodeURIComponent(hash.slice(1));
    if (!id) return undefined;

    let timer;
    const startedAt = Date.now();

    const tryScroll = () => {
      const el = document.getElementById(id);
      if (el) {
        // "auto" rather than "smooth": arriving from outside the site, a long animated scroll
        // reads as the page moving on its own.
        el.scrollIntoView({ behavior: 'auto', block: 'start' });
        return;
      }
      if (Date.now() - startedAt < GIVE_UP_AFTER_MS) {
        timer = setTimeout(tryScroll, RETRY_EVERY_MS);
      }
    };

    tryScroll();
    return () => clearTimeout(timer);
  }, [hash, pathname]);

  return null;
}
