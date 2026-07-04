"use client";

import { useState, useSyncExternalStore } from "react";
import { BellRing, X } from "lucide-react";
import { Button } from "../ui/Button";
import { SubscriptionWaitlistForm } from "../payments/SubscriptionWaitlistForm";

const STORAGE_KEY = "hairfit-subscription-waitlist-notice-dismissed";
const NOTICE_DISMISSED_EVENT = "hairfit:subscription-waitlist-notice-dismissed";

function subscribeToNoticeDismissal(onStoreChange: () => void) {
  window.addEventListener(NOTICE_DISMISSED_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);

  return () => {
    window.removeEventListener(NOTICE_DISMISSED_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function shouldShowNotice() {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) !== "true";
  } catch {
    return true;
  }
}

export function SubscriptionPaymentNoticeModal() {
  const [dismissedInMemory, setDismissedInMemory] = useState(false);
  const shouldOpen = useSyncExternalStore(subscribeToNoticeDismissal, shouldShowNotice, () => false);
  const open = shouldOpen && !dismissedInMemory;

  const closeNotice = () => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Ignore storage failures and only close the in-memory notice.
    }

    setDismissedInMemory(true);
    window.dispatchEvent(new Event(NOTICE_DISMISSED_EVENT));
  };

  if (!open) {
    return null;
  }

  return (
    <div
      aria-labelledby="subscription-payment-notice-title"
      aria-modal="true"
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/45 px-3 py-3 sm:items-center sm:px-6"
      role="dialog"
    >
      <div className="w-full max-w-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] border border-amber-200 bg-amber-50 text-amber-800">
              <BellRing className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="app-kicker">Payment Notice</p>
              <h2
                className="mt-2 text-2xl font-black tracking-tight text-[var(--app-text)]"
                id="subscription-payment-notice-title"
              >
                구독 결제 오픈을 준비 중입니다
              </h2>
            </div>
          </div>
          <button
            aria-label="공지 닫기"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border)] text-[var(--app-muted)] transition hover:border-[var(--app-border-strong)] hover:text-[var(--app-text)]"
            onClick={closeNotice}
            type="button"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-4 text-sm leading-6 text-[var(--app-muted)]">
          현재 PG 연동 준비로 Basic, Standard, Pro 구독 결제는 웨잇리스트로 운영합니다.
          신청하시면 결제 오픈 시 우선 안내드리겠습니다.
        </p>
        <div className="mt-5">
          <SubscriptionWaitlistForm />
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="button" onClick={closeNotice} className="min-h-11 px-5">
            나중에 보기
          </Button>
        </div>
      </div>
    </div>
  );
}
