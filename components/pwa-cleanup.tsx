"use client";

import { useEffect } from "react";

/**
 * The app used to be installable (PWA). That feature was removed, so this
 * unregisters any service worker a browser may already have installed and
 * clears its caches — leaving the app as a plain website. Safe to delete once
 * all clients have loaded the app at least once after this change.
 */
export function PwaCleanup() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {});
    if (typeof caches !== "undefined") {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
    }
  }, []);

  return null;
}
