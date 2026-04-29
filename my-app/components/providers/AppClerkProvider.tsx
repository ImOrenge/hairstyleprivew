import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { getClerkConfigState } from "../../lib/clerk";
import { ClerkAvailabilityProvider } from "./ClerkAvailabilityProvider";

export function AppClerkProvider({ children }: { children: ReactNode }) {
  const { canUseClerkFrontend, publishableKey } = getClerkConfigState();

  if (!canUseClerkFrontend || !publishableKey) {
    return <ClerkAvailabilityProvider enabled={false}>{children}</ClerkAvailabilityProvider>;
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClerkAvailabilityProvider enabled>{children}</ClerkAvailabilityProvider>
    </ClerkProvider>
  );
}
