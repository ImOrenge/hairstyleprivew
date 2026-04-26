"use client";

import { useClerkAvailable } from "../providers/ClerkAvailabilityProvider";
import { AuthLinks, ClerkAuthButtons } from "./ClerkAuthButtons";

export function HeaderAuthSlot() {
  const hasClerkProvider = useClerkAvailable();

  if (!hasClerkProvider) {
    return <AuthLinks />;
  }

  return <ClerkAuthButtons />;
}
