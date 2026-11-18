"use client";
import { useEffect } from 'react';

const KEY = 'fsp-enrollment-update';
export function notifyEnrollmentChanged() {
  window.dispatchEvent(new Event('fsp-enrollment-changed'));
  // Only a timestamp is shared; account data stays in authenticated queries.
  try { localStorage.setItem(KEY, `${Date.now()}-${Math.random()}`); } catch { /* Storage may be disabled. */ }
}

/** Refresh across tabs and on returning to the page; poll for other devices. */
export function useEnrollmentRefresh(reload: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => { if (document.visibilityState !== 'hidden') reload(); };
    const storage = (event: StorageEvent) => { if (event.key === KEY) refresh(); };
    const timer = setInterval(refresh, 15000);
    window.addEventListener('fsp-enrollment-changed', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); window.removeEventListener('fsp-enrollment-changed', refresh); window.removeEventListener('focus', refresh); window.removeEventListener('storage', storage); document.removeEventListener('visibilitychange', refresh); };
  }, [reload, enabled]);
}
