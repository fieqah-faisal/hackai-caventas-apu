import { Construction } from "lucide-react";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

/** Honest placeholder for nav destinations outside this build pass. */
export function PlaceholderPage({ title }: { title: string }) {
  useDocumentTitle(title);
  return (
    <div className="space-y-6">
      <h1 className="text-title font-semibold text-text-primary">{title}</h1>
      <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-border-subtle bg-surface px-6 py-16 text-center">
        <Construction size={22} className="text-text-muted" aria-hidden />
        <p className="text-base text-text-secondary">
          {title} is not part of this build pass.
        </p>
        <p className="text-meta text-text-muted max-w-sm">
          The dashboard is the surface delivered here; this destination comes
          next.
        </p>
      </div>
    </div>
  );
}