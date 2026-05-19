"use client";

import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";

export function AccountSetupPromptModal({ open }: { open: boolean }) {
  const [dismissed, setDismissed] = useState(false);

  if (!open || dismissed) {
    return null;
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 px-3 py-3 sm:items-center sm:px-6"
      role="dialog"
    >
      <div className="w-full max-w-md border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="app-kicker">Account Setup</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-[var(--app-text)]">
              계정 설정을 먼저 완료해 주세요
            </h2>
          </div>
          <button
            aria-label="닫기"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border)] text-[var(--app-muted)] transition hover:border-[var(--app-border-strong)] hover:text-[var(--app-text)]"
            onClick={() => setDismissed(true)}
            type="button"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
          닉네임, 성별, 선호 스타일 톤을 저장하면 헤어 추천 생성 흐름을 바로 사용할 수 있습니다.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-5 py-3 text-sm font-bold uppercase tracking-[0.04em] !text-[var(--app-inverse-text)] transition hover:bg-[var(--app-inverse-muted)]"
            href="/mypage?tab=account&setup=1"
          >
            계정 설정하기
          </Link>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-5 py-3 text-sm font-bold uppercase tracking-[0.04em] text-[var(--app-text)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-muted)]"
            onClick={() => setDismissed(true)}
            type="button"
          >
            나중에 하기
          </button>
        </div>
      </div>
    </div>
  );
}
