'use client';

import { useEffect } from 'react';

/**
 * Registers /sw.js so the app becomes installable (PBI 15).
 *
 * Registration is skipped in development: the dev server serves unfingerprinted
 * modules and a service worker sitting in front of them turns every HMR update
 * into a stale-asset hunt.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    // Registering after load keeps the worker off the critical path.
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Blocked by browser settings or an insecure origin — the app works
        // exactly as before, it just is not installable.
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
