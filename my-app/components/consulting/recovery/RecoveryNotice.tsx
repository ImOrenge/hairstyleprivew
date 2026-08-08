"use client";

import { Button } from "../../ui/Button";
import { Panel } from "../../ui/Surface";

export function RecoveryNotice({ onRetry }: { onRetry: () => void }) {
  return <div className="mx-auto flex min-h-dvh max-w-3xl items-center px-4 py-12"><Panel className="w-full p-6 sm:p-8"><p className="app-kicker">Recovery</p><h1 className="mt-3 text-3xl font-black">상담 화면을 복구할 수 있습니다</h1><p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">서버 스냅샷은 유지되어 있습니다. 다시 불러오면 마지막으로 저장된 단계와 선택으로 돌아갑니다.</p><Button type="button" className="mt-6" onClick={onRetry}>서버 상태 다시 불러오기</Button></Panel></div>;
}
