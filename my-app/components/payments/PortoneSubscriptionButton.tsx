"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Button } from "../ui/Button";

export type SelfServeSubscriptionPlanKey = "basic" | "standard" | "pro";

interface PortoneSubscriptionButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "onClick" | "type"> {
  planKey: SelfServeSubscriptionPlanKey;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "inverse";
  successRedirectPath?: string;
}

function checkoutUrl(planKey: SelfServeSubscriptionPlanKey, successRedirectPath: string) {
  const url = new URL("/billing/checkout", window.location.origin);
  url.searchParams.set("plan", planKey);
  url.searchParams.set("returnTo", successRedirectPath);
  return `${url.pathname}${url.search}`;
}

export function PortoneSubscriptionButton({
  planKey,
  children,
  variant = "primary",
  className,
  disabled,
  successRedirectPath = "/mypage",
  ...buttonProps
}: PortoneSubscriptionButtonProps) {
  return (
    <div className="grid w-full gap-2">
      <Button
        type="button"
        onClick={() => window.location.assign(checkoutUrl(planKey, successRedirectPath))}
        disabled={disabled}
        variant={variant}
        className={className}
        {...buttonProps}
      >
        {children}
      </Button>
    </div>
  );
}
