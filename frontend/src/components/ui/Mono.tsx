import type { ReactNode } from "react";
import { cx } from "@/lib/format";

/**
 * Technical identifier rendered in IBM Plex Mono. Use ONLY for case ids,
 * state versions, tool names, commands, hashes and structured values —
 * never for prose. Long values truncate with an accessible full-value title.
 */
export function Mono({
  children,
  title,
  className,
}: {
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      className={cx("mono text-xs text-text-secondary", className)}
      title={title}
    >
      {children}
    </span>
  );
}