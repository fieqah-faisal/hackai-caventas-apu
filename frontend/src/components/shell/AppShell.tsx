import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar, SidebarDrawer } from "./Sidebar";
import { TopBar } from "./TopBar";
import { ConnectionBanner } from "./ConnectionBanner";
import { getProvider } from "@/lib/api";

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<number | null>(null);
  const location = useLocation();

  // Aggregate pending-approval count for the top bar. Only available where the
  // provider can supply it (fixture mode); API mode has no global endpoint, so
  // the count stays null and the badge is hidden rather than fabricated.
  useEffect(() => {
    let alive = true;
    getProvider()
      .getHumanDecisions()
      .then((o) => {
        if (alive && o.kind === "ok") setPendingApprovals(o.value.data.awaitingApproval);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [location.pathname]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="flex h-screen flex-col bg-canvas text-text-primary">
      <TopBar onOpenMenu={() => setDrawerOpen(true)} pendingApprovals={pendingApprovals} />
      <ConnectionBanner />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <SidebarDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-shell px-5 py-7 sm:px-7 sm:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}