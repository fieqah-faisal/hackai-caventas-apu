import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons/Icon";
import { actionStateLabel } from "@/lib/format";
import { cx } from "@/lib/types";
import type { PlanActionState } from "@/lib/types";

/**
 * Status is NEVER colour-alone: every badge pairs a hue with a text label and
 * (optionally) an icon. Tone sets the hue; the label sets the meaning.
 */
export type Tone = "neutral" | "accent" | "warning" | "danger" | "info";

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
        "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClass[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/**
 * Canonical six-state action badge. Simulated and validated_effective are
 * kept visually distinct; lime (accent) is reserved for validated_effective.
 */
const STATE_VISUAL: Record<PlanActionState, { tone: Tone; icon: IconName }> = {
  proposed: { tone: "warning", icon: "humanDecision" },
  approved: { tone: "info", icon: "success" },
  simulated: { tone: "info", icon: "running" },
  validated_effective: { tone: "accent", icon: "success" },
  validated_ineffective: { tone: "danger", icon: "blocked" },
  not_applicable: { tone: "neutral", icon: "blocked" },
  superseded: { tone: "neutral", icon: "reload" },
};

export function ActionStateBadge({ state }: { state: PlanActionState }) {
  const v = STATE_VISUAL[state];
  return (
    <StatusBadge tone={v.tone} icon={<Icon name={v.icon} size={18} />}>
      {actionStateLabel[state]}
    </StatusBadge>
  );
}

export function EscalationBadge() {
  return (
    <StatusBadge tone="danger" icon={<Icon name="shield" size={18} />}>
      Senior approval required
    </StatusBadge>
  );
}
