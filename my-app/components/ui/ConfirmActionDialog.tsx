"use client";

import type { ReactNode } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

export interface ConfirmActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  pendingLabel?: string;
  isPending?: boolean;
  confirmDisabled?: boolean;
  tone?: "default" | "danger";
  target?: ReactNode;
  beforeValue?: ReactNode;
  afterValue?: ReactNode;
  confirmationSlot?: ReactNode;
}

export function ConfirmActionDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  pendingLabel = "처리 중…",
  isPending = false,
  confirmDisabled = false,
  tone = "default",
  target,
  beforeValue,
  afterValue,
  confirmationSlot,
}: ConfirmActionDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      dismissible={!isPending}
      showCloseButton={!isPending}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            data-tone={tone}
            className="c-confirm-dialog__confirm"
            onClick={onConfirm}
            disabled={isPending || confirmDisabled}
            aria-busy={isPending || undefined}
          >
            {isPending ? pendingLabel : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="c-confirm-dialog__content">
        {target || beforeValue || afterValue ? (
          <dl className="c-confirm-dialog__details">
            {target ? (
              <div>
                <dt>대상</dt>
                <dd>{target}</dd>
              </div>
            ) : null}
            {beforeValue ? (
              <div>
                <dt>변경 전</dt>
                <dd>{beforeValue}</dd>
              </div>
            ) : null}
            {afterValue ? (
              <div>
                <dt>변경 후</dt>
                <dd>{afterValue}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        <p className="c-confirm-dialog__hint">
          {tone === "danger" ? "이 작업은 되돌릴 수 없습니다." : "내용을 확인한 뒤 진행해 주세요."}
        </p>
        {confirmationSlot ? <div className="c-confirm-dialog__confirmation">{confirmationSlot}</div> : null}
      </div>
    </Dialog>
  );
}
