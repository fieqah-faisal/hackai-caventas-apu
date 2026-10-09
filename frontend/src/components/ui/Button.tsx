import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/format";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leadingIcon?: ReactNode;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded font-semibold " +
  "transition-colors duration-180 focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-45";

const variants: Record<Variant, string> = {
  // Lime is reserved for primary action.
  primary:
    "bg-accent text-accent-text hover:bg-accent-hover active:bg-accent-pressed",
  secondary:
    "bg-surface-raised text-text-primary border border-border-strong " +
    "hover:bg-surface-hover",
  ghost:
    "text-text-secondary hover:text-text-primary hover:bg-surface-hover",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-btn",
  md: "h-9 px-3.5 text-btn",
};

export function Button({
  variant = "secondary",
  size = "md",
  leadingIcon,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cx(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      {leadingIcon}
      {children}
    </button>
  );
}
