import type { ReactNode } from "react";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/Region";
import { Icon } from "@/components/icons/Icon";
import { outcomeMessage, type AsyncOutcome } from "@/lib/useOutcome";

/**
 * Renders a provider outcome honestly: loading -> skeletons; error (incl.
 * unsupported / not_implemented / offline / network / http) -> an explicit
 * message with retry; ok -> children(data). Never fabricates data.
 */
export function AsyncBoundary<T>({
  outcome,
  skeletonRows = 3,
  emptyWhen,
  emptyTitle = "Nothing to show",
  emptyHint,
  children,
}: {
  outcome: AsyncOutcome<T>;
  skeletonRows?: number;
  emptyWhen?: (data: T) => boolean;
  emptyTitle?: string;
  emptyHint?: string;
  children: (data: T) => ReactNode;
}) {
  if (outcome.state === "loading") return <SkeletonRows rows={skeletonRows} />;
  if (outcome.state === "error" || !outcome.value) {
    const f = outcome.failure;
    const message = f ? outcomeMessage(f) : "Something went wrong.";
    return <ErrorState message={message} onRetry={outcome.retry} />;
  }
  const data = outcome.value.data;
  if (emptyWhen && emptyWhen(data)) {
    return (
      <EmptyState
        icon={<Icon name="info" size={24} />}
        title={emptyTitle}
        hint={emptyHint}
      />
    );
  }
  return <>{children(data)}</>;
}