"use client";

import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const dialogStack: string[] = [];
let bodyLockCount = 0;
let originalBodyOverflow = "";
let originalBodyPaddingRight = "";

const subscribeToClient = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function lockBodyScroll() {
  if (bodyLockCount === 0) {
    originalBodyOverflow = document.body.style.overflow;
    originalBodyPaddingRight = document.body.style.paddingRight;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      const currentPadding = Number.parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
    }
    document.body.style.overflow = "hidden";
  }

  bodyLockCount += 1;
}

function unlockBodyScroll() {
  bodyLockCount = Math.max(0, bodyLockCount - 1);
  if (bodyLockCount === 0) {
    document.body.style.overflow = originalBodyOverflow;
    document.body.style.paddingRight = originalBodyPaddingRight;
  }
}

function registerDialog(dialogId: string) {
  dialogStack.push(dialogId);
  lockBodyScroll();

  return () => {
    const index = dialogStack.lastIndexOf(dialogId);
    if (index >= 0) {
      dialogStack.splice(index, 1);
    }
    unlockBodyScroll();
  };
}

function isTopDialog(dialogId: string) {
  return dialogStack.at(-1) === dialogId;
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true",
  );
}

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  id?: string;
  className?: string;
  closeLabel?: string;
  dismissible?: boolean;
  showCloseButton?: boolean;
  size?: DialogSize;
}

export type DialogSize = "sm" | "md" | "lg" | "xl";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  id,
  className,
  closeLabel = "닫기",
  dismissible = true,
  showCloseButton = true,
  size = "md",
}: DialogProps) {
  const generatedId = useId().replaceAll(":", "");
  const dialogId = id ?? `dialog-${generatedId}`;
  const titleId = `${dialogId}-title`;
  const descriptionId = description ? `${dialogId}-description` : undefined;
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const isClient = useSyncExternalStore(subscribeToClient, getClientSnapshot, getServerSnapshot);
  const portalNode = isClient ? document.body : null;

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  useEffect(() => {
    if (!open || !portalNode) {
      return;
    }

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const unregisterDialog = registerDialog(dialogId);
    const focusFrame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel || !isTopDialog(dialogId)) {
        return;
      }

      const firstFocusable = getFocusableElements(panel)[0];
      (firstFocusable ?? panel).focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopDialog(dialogId)) {
        return;
      }

      if (event.key === "Escape" && dismissible) {
        event.preventDefault();
        onOpenChangeRef.current(false);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const panel = panelRef.current;
      if (!panel) {
        return;
      }

      const focusableElements = getFocusableElements(panel);
      if (focusableElements.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1) ?? firstElement;
      const activeElement = document.activeElement;

      if (event.shiftKey && (activeElement === firstElement || !panel.contains(activeElement))) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && (activeElement === lastElement || !panel.contains(activeElement))) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      unregisterDialog();
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    };
  }, [dialogId, dismissible, open, portalNode]);

  if (!open || !portalNode) {
    return null;
  }

  const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (dismissible && event.target === event.currentTarget && isTopDialog(dialogId)) {
      onOpenChangeRef.current(false);
    }
  };

  return createPortal(
    <div
      className="c-dialog-backdrop"
      data-dialog-id={dialogId}
      data-state="open"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        ref={panelRef}
        id={dialogId}
        className={cn("c-dialog", className)}
        data-dismissible={dismissible ? "true" : "false"}
        data-pointer-glow="surface"
        data-size={size}
        data-state="open"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <div className="c-dialog__header">
          <h2 id={titleId} className="c-dialog__title">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="c-dialog__description">
              {description}
            </p>
          ) : null}
        </div>

        {showCloseButton && dismissible ? (
          <button
            type="button"
            className="c-dialog__close"
            aria-label={closeLabel}
            onClick={() => onOpenChangeRef.current(false)}
          >
            <span aria-hidden="true">×</span>
          </button>
        ) : null}

        <div className="c-dialog__body">{children}</div>
        {footer ? <div className="c-dialog__footer">{footer}</div> : null}
      </div>
    </div>,
    portalNode,
  );
}
