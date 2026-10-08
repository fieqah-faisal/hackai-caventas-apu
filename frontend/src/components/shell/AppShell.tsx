import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar, SidebarDrawer } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer on route change.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Close on Escape.
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
      <TopBar onOpenMenu={() => setDrawerOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <SidebarDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-shell px-4 py-5 sm:px-6 sm:py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}