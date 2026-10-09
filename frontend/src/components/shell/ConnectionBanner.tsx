import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/lib/useDashboardData";

/**
 * Restrained top-level banner when the browser reports offline. A backend
 * request failure is handled separately in each region's error state; this
 * only reflects navigator connectivity.
 */
export function ConnectionBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-status-warning/40 bg-status-warning/10 px-4 py-2 text-meta text-status-warning"
    >
      <WifiOff size={14} aria-hidden />
      You appear to be offline. Live data may be stale until the connection
      returns.
    </div>
  );
}