"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Periodically re-runs the enclosing server component (via router.refresh())
 * so pages backed by Server Actions stay reasonably fresh without a client
 * Firebase SDK / realtime listeners. Also refreshes when the tab regains
 * focus or becomes visible again, which covers the common "switched apps to
 * check the score, came back" case cheaply.
 */
export function usePolling(intervalMs = 5000) {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, intervalMs);

    function onFocus() {
      router.refresh();
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible") router.refresh();
    }

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router, intervalMs]);
}
