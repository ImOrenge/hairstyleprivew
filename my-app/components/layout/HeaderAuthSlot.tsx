"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { ClerkAuthButtons } from "./ClerkAuthButtons";

function getPublishableKey() {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  return typeof key === "string" && key.trim() ? key.trim() : null;
}

export function HeaderAuthSlot() {
  const publishableKey = getPublishableKey();
  const isLiveKeyOnLocalDev =
    process.env.NODE_ENV !== "production" && publishableKey?.startsWith("pk_live_");

  if (!publishableKey || isLiveKeyOnLocalDev) {
    return <ClerkAuthButtons />;
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClerkAuthButtons />
    </ClerkProvider>
  );
}
