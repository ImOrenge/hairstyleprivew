"use client";

import { useEffect, useSyncExternalStore } from "react";

export interface CoordinatedModalRequest {
  id: string;
  priority: number;
  order: number;
  requestedOpen: boolean;
}

export interface UseCoordinatedModalOptions {
  id: string;
  priority: number;
  requestedOpen: boolean;
}

export const AUTOMATIC_MODAL_PRIORITY = {
  subscriptionPaymentNotice: 200,
  accountSetupPrompt: 100,
} as const;

const requests = new Map<string, CoordinatedModalRequest>();
const listeners = new Set<() => void>();
let nextOrder = 0;
let activeModalId: string | null = null;

export function selectActiveModal(
  candidates: readonly CoordinatedModalRequest[],
): string | null {
  return (
    candidates
      .filter((candidate) => candidate.requestedOpen)
      .toSorted((left, right) => right.priority - left.priority || left.order - right.order)[0]
      ?.id ?? null
  );
}

function emitActiveModalChange() {
  const nextActiveModalId = selectActiveModal(Array.from(requests.values()));
  if (nextActiveModalId === activeModalId) {
    return;
  }

  activeModalId = nextActiveModalId;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return activeModalId;
}

function getServerSnapshot() {
  return null;
}

function registerRequest(id: string, priority: number) {
  nextOrder += 1;
  requests.set(id, {
    id,
    priority,
    order: nextOrder,
    requestedOpen: false,
  });
  emitActiveModalChange();

  return () => {
    requests.delete(id);
    emitActiveModalChange();
  };
}

function updateRequest(id: string, priority: number, requestedOpen: boolean) {
  const request = requests.get(id);
  if (!request) {
    return;
  }

  requests.set(id, {
    ...request,
    priority,
    requestedOpen,
  });
  emitActiveModalChange();
}

export function useCoordinatedModal({
  id,
  priority,
  requestedOpen,
}: UseCoordinatedModalOptions) {
  const coordinatedModalId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => registerRequest(id, priority), [id, priority]);

  useEffect(() => {
    updateRequest(id, priority, requestedOpen);
  }, [id, priority, requestedOpen]);

  return requestedOpen && coordinatedModalId === id;
}
