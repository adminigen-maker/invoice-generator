"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a server-rendered view fresh without a full reload: calls
 * router.refresh() (re-runs the page's server components / queries and swaps in
 * new data, preserving scroll and client state) on an interval while the tab is
 * visible, and immediately when the tab regains focus. Polling pauses while the
 * tab is hidden so background tabs don't hit the DB.
 */
export function AutoRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const start = () => {
      if (!timer) timer = setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        router.refresh(); // catch up immediately on return
        start();
      } else {
        stop();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", tick);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", tick);
    };
  }, [router, intervalMs]);

  return null;
}
