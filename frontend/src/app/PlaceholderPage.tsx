import { Icon } from "@/components/icons/Icon";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

/** Honest placeholder for nav destinations outside the built surfaces. */
export function PlaceholderPage({ title }: { title: string }) {
  useDocumentTitle(title);
  return (
    <div className="space-y-6">
      <h1 className="text-title font-bold text-text-primary">{title}</h1>
      <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-border-subtle bg-surface px-6 py-16 text-center">
        <Icon name="info" size={24} className="text-text-muted" />
        <p className="text-base text-text-secondary">{title} is not part of this build pass.</p>
        <p className="text-meta text-text-muted max-w-sm">
          The dashboard, create-case flow and case workspace are the surfaces
          delivered here; this destination comes next.
        </p>
      </div>
    </div>
  );
}