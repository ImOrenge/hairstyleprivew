"use client";

import Link from "next/link";
import { X } from "lucide-react";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { useState } from "react";
import type { SubscriptionAccessMode } from "../../lib/subscription-access";
import { useHeaderAccount } from "../layout/HeaderAccountContext";
import { buttonClassName, type ButtonVariant } from "../ui/Button";
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
  subscriptionAccessMode = "waitlist",
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
      {waitlistOpen ? (
        <div
          aria-labelledby={`subscription-waitlist-title-${planKey}`}
          aria-modal="true"
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 px-3 py-3 sm:items-center sm:px-6"
          role="dialog"
        >
          <div className="w-full max-w-md border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="app-kicker">Subscription Waitlist</p>
                <h2
                  className="mt-2 text-2xl font-black tracking-tight text-[var(--app-text)]"
                  id={`subscription-waitlist-title-${planKey}`}
                >
                  {selectedPlanLabel} 오픈 알림을 신청하세요
                </h2>
              </div>
              <button
                aria-label="닫기"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border)] text-[var(--app-muted)] transition hover:border-[var(--app-border-strong)] hover:text-[var(--app-text)]"
                onClick={() => setWaitlistOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
              현재 PG 연동 준비로 구독 결제는 잠시 대기 중입니다. 신청하시면 결제 오픈 시 우선 안내드리겠습니다.
            </p>
            <div className="mt-5">
              <SubscriptionWaitlistForm
                initialEmail={initialEmail}
                initialPlanKey={planKey}
                lockPlan
                sourcePath={targetCheckoutPath}
              />
            </div>
          </div>
        </div>
      ) : null}
      {loginPromptOpen ? (
        <div
          aria-labelledby={`subscription-login-title-${planKey}`}
          aria-modal="true"
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 px-3 py-3 sm:items-center sm:px-6"
          role="dialog"
        >
          <div className="w-full max-w-md border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="app-kicker">Plan Checkout</p>
                <h2
                  className="mt-2 text-2xl font-black tracking-tight text-[var(--app-text)]"
                  id={`subscription-login-title-${planKey}`}
                >
                  로그인 후 {selectedPlanLabel} 플랜을 시작하세요
                </h2>
              </div>
              <button
                aria-label="닫기"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border)] text-[var(--app-muted)] transition hover:border-[var(--app-border-strong)] hover:text-[var(--app-text)]"
                onClick={() => setLoginPromptOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
              결제와 구독 관리는 계정에 연결됩니다. 로그인하면 선택한 플랜 정보가 유지된 상태로 결제 단계가 이어집니다.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-5 py-3 text-sm font-bold uppercase tracking-[0.04em] !text-[var(--app-inverse-text)] transition hover:bg-[var(--app-inverse-muted)]"
                href={loginHref}
              >
                로그인하고 결제 계속하기
              </Link>
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-5 py-3 text-sm font-bold uppercase tracking-[0.04em] text-[var(--app-text)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-muted)]"
                onClick={() => setLoginPromptOpen(false)}
                type="button"
              >
                나중에 선택
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
