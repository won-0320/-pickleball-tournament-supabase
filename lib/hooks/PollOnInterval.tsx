"use client";

import { usePolling } from "./usePolling";

/**
 * Drop into a server component's tree to keep its data fresh via polling.
 * Renders nothing — it only exists to host the client-side effect.
 */
export default function PollOnInterval({ intervalMs = 5000 }: { intervalMs?: number }) {
  usePolling(intervalMs);
  return null;
}
