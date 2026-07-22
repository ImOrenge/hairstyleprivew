"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, type ReactNode } from "react";
import { normalizeGenerationOwnerId } from "../../lib/generation-owner-state";
import { useGenerationStore } from "../../store/useGenerationStore";
import { useClerkAvailable } from "./ClerkAvailabilityProvider";

function ClerkGenerationAuthBoundary({ children }: { children: ReactNode }) {
  const { isLoaded, userId } = useAuth();
  const bindGenerationOwner = useGenerationStore((state) => state.bindGenerationOwner);
  const generationOwnerId = useGenerationStore((state) => state.generationOwnerId);
  const generationOwnerBound = useGenerationStore((state) => state.generationOwnerBound);
  const imageHydrated = useGenerationStore((state) => state.imageHydrated);
  const normalizedUserId = userId ? normalizeGenerationOwnerId(userId) : null;
  const activeOwnerId: string | null | undefined = !isLoaded || (userId && !normalizedUserId)
    ? undefined
    : normalizedUserId;

  useEffect(() => {
    if (activeOwnerId === undefined) {
      return;
    }

    void bindGenerationOwner(activeOwnerId).catch(() => undefined);
  }, [activeOwnerId, bindGenerationOwner]);

  if (
    activeOwnerId === undefined ||
    !generationOwnerBound ||
    generationOwnerId !== activeOwnerId ||
    (activeOwnerId !== null && !imageHydrated)
  ) {
    return (
      <div className="mx-auto flex min-h-[40vh] max-w-5xl items-center justify-center px-4" role="status" aria-live="polite">
        <p className="text-sm font-semibold text-[var(--app-muted)]">
          계정별 생성 정보를 안전하게 확인하고 있습니다.
        </p>
      </div>
    );
  }

  return children;
}

export function GenerationAuthBoundary({ children }: { children: ReactNode }) {
  const hasClerkProvider = useClerkAvailable();

  if (!hasClerkProvider) {
    return children;
  }

  return <ClerkGenerationAuthBoundary>{children}</ClerkGenerationAuthBoundary>;
}
