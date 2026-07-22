import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

export type InlineAlertTone = "info" | "success" | "warning" | "danger";

export interface InlineAlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: InlineAlertTone;
  title?: ReactNode;
  action?: ReactNode;
}

export function InlineAlert({
  tone = "info",
  title,
  action,
  children,
  className,
  role,
  "aria-live": ariaLive,
  "aria-atomic": ariaAtomic,
  ...props
}: InlineAlertProps) {
  const resolvedRole = role ?? (tone === "danger" ? "alert" : "status");

  return (
    <div
      className={cn("c-inline-alert", className)}
      data-state="visible"
      data-tone={tone}
      role={resolvedRole}
      aria-live={ariaLive ?? (resolvedRole === "alert" ? "assertive" : "polite")}
      aria-atomic={ariaAtomic ?? true}
      {...props}
    >
      <div className="c-inline-alert__content">
        {title ? <p className="c-inline-alert__title">{title}</p> : null}
        <div className="c-inline-alert__message">{children}</div>
      </div>
      {action ? <div className="c-inline-alert__action">{action}</div> : null}
    </div>
  );
}
