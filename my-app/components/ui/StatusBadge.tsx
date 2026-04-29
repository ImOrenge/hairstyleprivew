import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  children: ReactNode;
}

const toneClassMap: Record<StatusTone, string> = {
  neutral: "border-[var(--app-border)] bg-[var(--app-surface-muted)] text-[var(--app-text)]",
  success: "border-emerald-500/35 bg-emerald-500/10 text-[var(--app-success)]",
  warning: "border-amber-500/35 bg-amber-500/10 text-[var(--app-warning)]",
  danger: "border-rose-500/35 bg-rose-500/10 text-[var(--app-danger)]",
  info: "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)]",
};

export function StatusBadge({ tone = "neutral", className, children, ...props }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em]",
        toneClassMap[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
