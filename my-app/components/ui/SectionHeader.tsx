import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface SectionHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  inverse?: boolean;
  actions?: ReactNode;
  className?: string;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  align = "left",
  inverse = false,
  actions,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        align === "center" ? "mx-auto max-w-3xl items-center text-center" : "max-w-4xl",
        className,
      )}
    >
      {eyebrow ? <p className={inverse ? "app-inverse-kicker" : "app-kicker"}>{eyebrow}</p> : null}
      <div className={cn("flex flex-col gap-3", actions && align === "left" ? "lg:flex-row lg:items-end lg:justify-between" : "")}>
        <div>
          <h2
            className={cn(
              "text-2xl font-black tracking-tight sm:text-3xl",
              inverse ? "text-[var(--app-inverse-text)]" : "text-[var(--app-text)]",
            )}
          >
            {title}
          </h2>
          {description ? (
            <p className={cn("mt-3 text-sm leading-6 sm:text-base", inverse ? "app-inverse-muted" : "text-[var(--app-muted)]")}>
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </div>
  );
}
