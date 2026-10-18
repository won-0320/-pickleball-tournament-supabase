"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Periodically re-runs the enclosing server component (via router.refresh())
 * so pages backed by Server Actions stay reasonably fresh without a client
 * Firebase SDK / realtime listeners. Also refreshes when the tab becomes
 * visible again, which covers the common "switched apps to check the score,
 * came back" case cheaply.
 *
 * Every refresh re-reads the database on the server, so polling is skipped while
 * the page is hidden (screen off, other app/tab in front) — otherwise phones
 * left open on this page keep hammering the database.
 */
export function usePolling(intervalMs = 20000) {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);

    function onVisibilityChange() {
      if (document.visibilityState === "visible") router.refresh();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router, intervalMs]);
}
