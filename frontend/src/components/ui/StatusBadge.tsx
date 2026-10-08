import type { ReactNode } from "react";
import {
  CheckCircle2,
  CircleDashed,
  Clock,
  Loader2,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { cx } from "@/lib/format";

/**
 * Status is NEVER conveyed by colour alone: every badge carries a text
 * label and an icon. Tone sets the hue; the label sets the meaning.
 */
type Tone = "neutral" | "accent" | "warning" | "danger" | "info";

const toneClass: Record<Tone, string> = {
  neutral: "text-text-secondary border-border-strong",
  accent: "text-accent border-accent/40",
  warning: "text-status-warning border-status-warning/40",
  danger: "text-status-danger border-status-danger/45",
  info: "text-status-info border-status-info/40",
};

export function StatusBadge({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 " +
          "text-xs font-medium whitespace-nowrap",
        toneClass[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Semantic badge for the four legible action states + failed. */
export function ActionStateBadge({
  state,
}: {
  state: "proposed" | "approved" | "executed" | "effective" | "failed";
}) {
  const map = {
    proposed: {
      tone: "warning" as const,
      icon: <Clock size={13} aria-hidden />,
      label: "Proposed",
    },
    approved: {
      tone: "info" as const,
      icon: <CircleDashed size={13} aria-hidden />,
      label: "Approved",
    },
    executed: {
      tone: "neutral" as const,
      icon: <Loader2 size={13} aria-hidden />,
      label: "Executed",
    },
    effective: {
      tone: "accent" as const,
      icon: <CheckCircle2 size={13} aria-hidden />,
      label: "Confirmed",
    },
    failed: {
      tone: "danger" as const,
      icon: <XCircle size={13} aria-hidden />,
      label: "Failed",
    },
  }[state];

  return (
    <StatusBadge tone={map.tone} icon={map.icon}>
      {map.label}
    </StatusBadge>
  );
}

export function EscalationBadge() {
  return (
    <StatusBadge tone="danger" icon={<ShieldAlert size={13} aria-hidden />}>
      Senior approval required
    </StatusBadge>
  );
}
