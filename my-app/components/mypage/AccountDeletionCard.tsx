"use client";

import {
  ACCOUNT_DELETION_CONFIRMATION,
  ACCOUNT_DELETION_DISCLOSURE,
  type AccountDeletionResponse,
} from "@hairfit/shared";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/Button";
import { ConfirmActionDialog } from "../ui/ConfirmActionDialog";
import { SurfaceCard } from "../ui/Surface";

interface ErrorPayload {
  error?: unknown;
}

export function AccountDeletionCard() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = (nextOpen: boolean) => {
    if (pending) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setConfirmation("");
      setError(null);
    }
  };

  const deleteAccount = async () => {
    if (pending || confirmation.trim() !== ACCOUNT_DELETION_CONFIRMATION) return;
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation: confirmation.trim() }),
      });
      const payload = (await response.json().catch(() => ({}))) as
        | AccountDeletionResponse
        | ErrorPayload;
      if (!response.ok || !("ok" in payload) || payload.ok !== true) {
        throw new Error(
          "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "회원 탈퇴를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
      }

      window.location.replace("/");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "회원 탈퇴를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
      setPending(false);
    }
  };

  return (
    <>
      <SurfaceCard className="mt-4 border-red-200 bg-red-50 px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-black text-red-800">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              회원 탈퇴
            </p>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-red-700">
              {ACCOUNT_DELETION_DISCLOSURE}
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
            회원 탈퇴 시작
          </Button>
        </div>
      </SurfaceCard>

      <ConfirmActionDialog
        open={open}
        onOpenChange={close}
        onConfirm={() => void deleteAccount()}
        title="회원 탈퇴"
        description="모든 계정 데이터와 사진을 삭제하고 로그인 계정을 닫습니다. 진행 중인 생성과 결제 복귀는 이어서 처리할 수 없습니다."
        confirmLabel="영구 삭제"
        pendingLabel="삭제 중…"
        confirmDisabled={confirmation.trim() !== ACCOUNT_DELETION_CONFIRMATION}
        isPending={pending}
        tone="danger"
        target="현재 로그인된 계정"
        confirmationSlot={
          <div className="flex flex-col gap-2">
            <label htmlFor="account-deletion-confirmation" className="text-sm font-bold text-[var(--app-text)]">
              확인을 위해 <strong>{ACCOUNT_DELETION_CONFIRMATION}</strong>를 입력하세요.
            </label>
            <input
              id="account-deletion-confirmation"
              autoComplete="off"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={pending}
              className="min-h-11 rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] bg-[var(--app-surface)] px-3 text-sm text-[var(--app-text)] outline-none focus:ring-2 focus:ring-red-500"
            />
            {error ? (
              <p role="alert" className="text-sm font-semibold text-red-700">
                {error}
              </p>
            ) : null}
          </div>
        }
      />
    </>
  );
}
