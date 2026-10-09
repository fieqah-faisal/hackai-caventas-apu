import { Icon } from "@/components/icons/Icon";
import { cx } from "@/lib/types";

/**
 * Visible "Synthetic demo data" indicator. Shown on every surface whose data
 * comes from the FixtureProvider so synthetic data is never mistaken for real.
 */
export function SyntheticBadge({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded border border-border-subtle",
        "bg-surface px-2.5 py-1 text-meta text-text-muted whitespace-nowrap",
        className,
      )}
    >
      <Icon name="info" size={18} className="text-text-muted" />
      Synthetic demo data
    </span>
  );
}