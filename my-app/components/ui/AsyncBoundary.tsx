import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { resolveAsyncBoundaryState } from "../../lib/async-boundary-state";
import { InlineAlert } from "./InlineAlert";

export interface AsyncBoundaryProps {
  children: ReactNode;
  pending?: boolean;
  error?: unknown;
  isEmpty?: boolean;
  loadingTitle?: ReactNode;
  loadingDescription?: ReactNode;
  errorTitle?: ReactNode;
  errorDescription?: ReactNode;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  errorAction?: ReactNode;
  emptyAction?: ReactNode;
  className?: string;
}

export function AsyncBoundary({
  children,
  pending = false,
  error,
  isEmpty = false,
  loadingTitle = "불러오는 중입니다",
  loadingDescription = "잠시만 기다려 주세요.",
  errorTitle = "요청을 완료하지 못했습니다",
  errorDescription = "잠시 후 다시 시도해 주세요.",
  emptyTitle = "표시할 내용이 없습니다",
  emptyDescription = "조건을 바꾸거나 이전 단계에서 내용을 추가해 주세요.",
  errorAction,
  emptyAction,
  className,
}: AsyncBoundaryProps) {
  const state = resolveAsyncBoundaryState({ error, pending, isEmpty });

  if (state === "error") {
    return (
      <InlineAlert
        action={errorAction}
        className={cn("c-async-boundary", className)}
        data-async-state="error"
        title={errorTitle}
        tone="danger"
      >
        {errorDescription}
      </InlineAlert>
    );
  }

  if (state === "pending") {
    return (
      <div
        aria-atomic="true"
        aria-busy="true"
        aria-live="polite"
        className={cn("c-async-boundary", className)}
        data-async-state="pending"
        role="status"
      >
        <span className="c-async-boundary__spinner" aria-hidden="true" />
        <div>
          <p className="c-async-boundary__title">{loadingTitle}</p>
          <p className="c-async-boundary__description">{loadingDescription}</p>
        </div>
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div
        aria-atomic="true"
        aria-live="polite"
        className={cn("c-async-boundary", className)}
        data-async-state="empty"
        role="status"
      >
        <div>
          <p className="c-async-boundary__title">{emptyTitle}</p>
          <p className="c-async-boundary__description">{emptyDescription}</p>
        </div>
        {emptyAction ? <div className="c-async-boundary__action">{emptyAction}</div> : null}
      </div>
    );
  }

  return <>{children}</>;
}
