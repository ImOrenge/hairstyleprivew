import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../../lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "inverse";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variantClassMap: Record<Variant, string> = {
  primary: "border border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)] hover:border-[var(--app-accent)] hover:bg-[var(--app-inverse-muted)]",
  secondary: "border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-muted)]",
  ghost: "border border-transparent bg-transparent text-[var(--app-text)] hover:border-[var(--app-border)] hover:bg-[var(--app-surface-muted)]",
  inverse: "app-inverse-cta hover:opacity-90",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-[var(--app-radius-control)] px-4 py-2 text-sm font-semibold uppercase tracking-[0.04em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-ring)] disabled:cursor-not-allowed disabled:opacity-50",
          variantClassMap[variant],
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
