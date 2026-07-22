"use client";

import { useState, useSyncExternalStore } from "react";
import { BellRing, X } from "lucide-react";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { SubscriptionWaitlistForm } from "../payments/SubscriptionWaitlistForm";
import { AUTOMATIC_MODAL_PRIORITY, useCoordinatedModal } from "../../lib/modal-coordinator";

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
  const requestedOpen = shouldOpen && !dismissedInMemory;
  const open = useCoordinatedModal({
    id: "subscription-payment-notice",
    priority: AUTOMATIC_MODAL_PRIORITY.subscriptionPaymentNotice,
    requestedOpen,
  });

  const closeNotice = () => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Ignore storage failures and only close the in-memory notice.
    }

    setDismissedInMemory(true);
    window.dispatchEvent(new Event(NOTICE_DISMISSED_EVENT));
  };

  if (!requestedOpen) {
    return null;
  }

  return (
    <Dialog
      id="subscription-payment-notice"
      className="max-w-lg rounded-none shadow-2xl"
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closeNotice();
        }
      }}
      title={
        <span className="flex items-start gap-3 pr-3">
          <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] border border-amber-200 bg-amber-50 text-amber-800">
            <BellRing className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>
            <span className="app-kicker block">결제 안내</span>
            <span className="mt-2 block text-2xl font-black tracking-tight text-[var(--app-text)]">
              구독 결제 오픈을 준비 중입니다
            </span>
          </span>
        </span>
      }
      description="현재 Basic, Standard, Pro 정기 결제를 준비하고 있습니다. 신청하시면 결제가 열릴 때 우선 안내드리겠습니다."
      showCloseButton={false}
    >
      <button
        aria-label="공지 닫기"
        className="absolute right-5 top-5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border)] text-[var(--app-muted)] transition hover:border-[var(--app-border-strong)] hover:text-[var(--app-text)] sm:right-6 sm:top-6"
        onClick={closeNotice}
        type="button"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      <SubscriptionWaitlistForm />
      <div className="mt-4 flex justify-end">
        <Button type="button" onClick={closeNotice} className="min-h-11 px-5">
          나중에 보기
        </Button>
      </div>
    </Dialog>
  );
}
