"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, buttonClassName } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { AUTOMATIC_MODAL_PRIORITY, useCoordinatedModal } from "../../lib/modal-coordinator";

export function AccountSetupPromptModal({ open }: { open: boolean }) {
  const [dismissed, setDismissed] = useState(false);

  const requestedOpen = open && !dismissed;
  const dialogOpen = useCoordinatedModal({
    id: "account-setup-prompt",
    priority: AUTOMATIC_MODAL_PRIORITY.accountSetupPrompt,
    requestedOpen,
  });

  return (
    <Dialog
      id="account-setup-prompt"
      open={dialogOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setDismissed(true);
        }
      }}
      size="sm"
      title={
        <span>
          <span className="app-kicker block">계정 설정</span>
          <span className="mt-2 block text-2xl font-black tracking-tight text-[var(--app-text)]">
            계정 설정을 먼저 완료해 주세요
          </span>
        </span>
      }
      description="닉네임, 성별, 선호 스타일 톤을 저장하면 헤어 추천 생성 흐름을 바로 사용할 수 있습니다."
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => setDismissed(true)}>
            나중에 하기
          </Button>
          <Link className={buttonClassName("primary")} href="/mypage?tab=account&setup=1">
            계정 설정하기
          </Link>
        </>
      }
    >
      <p className="text-sm leading-6 text-[var(--app-muted)]">
        설정을 나중으로 미뤄도 홈은 계속 볼 수 있으며, 생성 시작 전 다시 계정 설정으로 이동할 수 있습니다.
      </p>
    </Dialog>
  );
}
