import { useNavigate } from "react-router-dom";
import { Bell, ChevronDown, Menu, Plus, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { pendingApprovalCount } from "@/lib/mock-data";

function Wordmark() {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="grid h-7 w-7 place-items-center rounded border border-accent/40 bg-surface"
      >
        <ShieldCheck size={16} className="text-accent" strokeWidth={2} />
      </span>
      <span className="text-case font-semibold tracking-tight text-text-primary">
        Caventas
      </span>
    </div>
  );
}

function GlobalSearch() {
  return (
    <div className="relative hidden md:block w-full max-w-md">
      <Search
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        aria-hidden
      />
      <input
        type="search"
        placeholder="Search cases, entities, evidence"
        aria-label="Global search"
        className="h-9 w-full rounded bg-canvas border border-border-subtle pl-9 pr-3 text-base text-text-primary placeholder:text-text-muted focus:border-border-strong focus-visible:outline-none"
      />
    </div>
  );
}

export function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const navigate = useNavigate();
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle bg-shell px-3 sm:px-4">
      <button
        onClick={onOpenMenu}
        className="grid h-9 w-9 shrink-0 place-items-center rounded text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors duration-180 lg:hidden"
        aria-label="Open navigation menu"
      >
        <Menu size={18} strokeWidth={1.75} aria-hidden />
      </button>

      <Wordmark />

      <div className="flex flex-1 items-center justify-center">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          onClick={() => navigate("/approvals")}
          className="relative grid h-9 w-9 place-items-center rounded text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors duration-180"
          aria-label={`Pending approvals: ${pendingApprovalCount}`}
        >
          <Bell size={17} strokeWidth={1.75} aria-hidden />
          {pendingApprovalCount > 0 && (
            <span className="tnum absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-status-warning px-1 text-2xs font-semibold text-canvas">
              {pendingApprovalCount}
            </span>
          )}
        </button>

        <Button
          variant="primary"
          leadingIcon={<Plus size={16} strokeWidth={2.25} aria-hidden />}
          className="whitespace-nowrap"
        >
          <span className="hidden sm:inline">Create New Case</span>
          <span className="sm:hidden">New Case</span>
        </Button>

        <button className="ml-0.5 flex items-center gap-2 rounded pl-1 pr-2 h-9 hover:bg-surface-hover transition-colors duration-180">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-surface-raised text-xs font-semibold text-text-secondary">
            FA
          </span>
          <span className="hidden lg:block text-sm text-text-secondary">
            Fieqah A.
          </span>
          <ChevronDown size={14} className="hidden lg:block text-text-muted" aria-hidden />
        </button>
      </div>
    </header>
  );
}