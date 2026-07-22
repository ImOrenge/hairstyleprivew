"use client";

import Link from "next/link";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { useState } from "react";
import type { SubscriptionAccessMode } from "../../lib/subscription-access";
import { useHeaderAccount } from "../layout/HeaderAccountContext";
import { Button, buttonClassName, type ButtonVariant } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { SubscriptionWaitlistForm } from "./SubscriptionWaitlistForm";

export type SelfServeSubscriptionPlanKey = "basic" | "standard" | "pro";

interface PortoneSubscriptionButtonProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "href" | "onClick"> {
  planKey: SelfServeSubscriptionPlanKey;
  children: ReactNode;
  variant?: ButtonVariant;
  disabled?: boolean;
  initialEmail?: string;
  requireAuth?: boolean;
  subscriptionAccessMode?: SubscriptionAccessMode;
  successRedirectPath?: string;
}

function checkoutPath(planKey: SelfServeSubscriptionPlanKey, successRedirectPath: string) {
  const params = new URLSearchParams({ plan: planKey });
  params.set("returnTo", successRedirectPath);
  return `/billing/checkout?${params.toString()}`;
}

function signInUrl(returnBackPath: string) {
  return `/login?redirect_url=${encodeURIComponent(returnBackPath)}`;
}

function planLabel(planKey: SelfServeSubscriptionPlanKey) {
  if (planKey === "basic") return "Basic";
  if (planKey === "standard") return "Standard";
  return "Pro";
}

export function PortoneSubscriptionButton({
  planKey,
  children,
  variant = "primary",
  className,
  disabled,
  initialEmail = "",
  requireAuth = true,
  subscriptionAccessMode = "checkout",
  successRedirectPath = "/mypage",
  ...buttonProps
}: PortoneSubscriptionButtonProps) {
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const { isAuthLoaded, isSignedIn } = useHeaderAccount();
  const targetCheckoutPath = checkoutPath(planKey, successRedirectPath);
  const loginHref = signInUrl(targetCheckoutPath);
  const href = subscriptionAccessMode === "checkout" && requireAuth && !isSignedIn ? loginHref : targetCheckoutPath;
  const isNavigationDisabled = Boolean(
    disabled || (subscriptionAccessMode === "checkout" && requireAuth && !isAuthLoaded),
  );
  const shouldPromptForLogin = Boolean(
    subscriptionAccessMode === "checkout" && requireAuth && isAuthLoaded && !isSignedIn,
  );
  const selectedPlanLabel = planLabel(planKey);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (disabled || isNavigationDisabled) {
      event.preventDefault();
      return;
    }

    if (subscriptionAccessMode === "waitlist") {
      event.preventDefault();
      setWaitlistOpen(true);
      return;
    }

    if (shouldPromptForLogin) {
      event.preventDefault();
      setLoginPromptOpen(true);
    }
  };

  return (
    <div className="grid w-full gap-2">
      <Link
        href={href}
        onClick={handleClick}
        aria-disabled={isNavigationDisabled}
        tabIndex={isNavigationDisabled ? -1 : undefined}
        className={buttonClassName(variant, className)}
        {...buttonProps}
      >
        {children}
      </Link>
      <Dialog
        id={`subscription-waitlist-${planKey}`}
        open={waitlistOpen}
        onOpenChange={setWaitlistOpen}
        size="sm"
        title={
          <span>
            <span className="app-kicker block">구독 오픈 알림</span>
            <span className="mt-2 block text-2xl font-black tracking-tight text-[var(--app-text)]">
              {selectedPlanLabel} 오픈 알림을 신청하세요
            </span>
          </span>
        }
        description="현재 정기 결제를 준비하고 있습니다. 신청하시면 결제가 열릴 때 우선 안내드리겠습니다."
      >
        <SubscriptionWaitlistForm
          initialEmail={initialEmail}
          initialPlanKey={planKey}
          lockPlan
          sourcePath={targetCheckoutPath}
        />
      </Dialog>

      <Dialog
        id={`subscription-login-${planKey}`}
        open={loginPromptOpen}
        onOpenChange={setLoginPromptOpen}
        size="sm"
        title={
          <span>
            <span className="app-kicker block">플랜 결제</span>
            <span className="mt-2 block text-2xl font-black tracking-tight text-[var(--app-text)]">
              로그인 후 {selectedPlanLabel} 플랜을 시작하세요
            </span>
          </span>
        }
        description="결제와 구독 관리는 계정에 연결됩니다. 로그인하면 선택한 플랜 정보가 유지된 상태로 결제 단계가 이어집니다."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setLoginPromptOpen(false)}>
              나중에 선택
            </Button>
            <Link className={buttonClassName("primary")} href={loginHref}>
              로그인하고 결제 계속하기
            </Link>
          </>
        }
      >
        <p className="text-sm leading-6 text-[var(--app-muted)]">
          로그인 전에는 결제가 시작되지 않으며, 로그인 후에도 선택한 플랜과 결제 금액을 다시 확인할 수 있습니다.
        </p>
      </Dialog>
    </div>
  );
}
