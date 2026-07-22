import { ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";
import { cn } from "../../lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "inverse";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  loadingLabel?: ReactNode;
}

const variantClassMap: Record<ButtonVariant, string> = {
  primary: "border border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)] hover:border-[var(--app-accent)] hover:bg-[var(--app-inverse-muted)]",
  secondary: "border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-muted)]",
  ghost: "border border-transparent bg-transparent text-[var(--app-text)] hover:border-[var(--app-border)] hover:bg-[var(--app-surface-muted)]",
  inverse: "app-inverse-cta hover:opacity-90",
};

export function buttonClassName(variant: ButtonVariant = "primary", className?: string) {
  return cn(
    "c-button inline-flex items-center justify-center rounded-[var(--app-radius-control)] px-4 py-2 text-sm font-semibold uppercase tracking-[0.04em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-ring)] disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
    variantClassMap[variant],
    className,
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      variant = "primary",
      disabled,
      loading = false,
      loadingLabel = "처리 중…",
      ...props
    },
    ref,
  ) => {
    const isAriaDisabled = props["aria-disabled"] === true || props["aria-disabled"] === "true";
    const isDisabled = Boolean(disabled || loading || isAriaDisabled);
    const state = loading ? "loading" : isDisabled ? "disabled" : "enabled";

    return (
      <button
        {...props}
        ref={ref}
        aria-busy={loading ? true : props["aria-busy"]}
        className={buttonClassName(variant, className)}
        data-state={state}
        data-variant={variant}
        disabled={isDisabled}
      >
        {loading ? loadingLabel : children}
      </button>
    );
  },
);

Button.displayName = "Button";
