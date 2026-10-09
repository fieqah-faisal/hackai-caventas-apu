import { Link } from "react-router-dom";
import { Icon } from "@/components/icons/Icon";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

export function NotFoundPage() {
  useDocumentTitle("Page not found");
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-6 text-center">
      <span
        aria-hidden
        className="grid h-14 w-14 place-items-center rounded-md border border-border-strong bg-surface"
      >
        <Icon name="search" size={28} className="text-accent" />
      </span>
      <div>
        <p className="tnum text-metric font-bold text-text-primary">404</p>
        <h1 className="mt-1 text-lg font-semibold text-text-primary">Page not found</h1>
        <p className="mt-1.5 max-w-sm text-base text-text-secondary">
          This route does not exist in the Caventas workspace. It may have moved
          or never existed.
        </p>
      </div>
      <Link
        to="/"
        className="inline-flex h-9 items-center rounded bg-accent px-4 text-btn font-semibold text-accent-text hover:bg-accent-hover transition-colors duration-180"
      >
        Back to dashboard
      </Link>
    </div>
  );
}