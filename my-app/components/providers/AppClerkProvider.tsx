import type { ReactNode } from "react";
import { getClerkConfigState } from "../../lib/clerk";
import { ClerkAvailabilityProvider } from "./ClerkAvailabilityProvider";
import { LocalizedClerkProvider } from "./LocalizedClerkProvider";

export function AppClerkProvider({ children }: { children: ReactNode }) {
  const { canUseClerkFrontend, publishableKey } = getClerkConfigState();

  if (!canUseClerkFrontend || !publishableKey) {
    return <ClerkAvailabilityProvider enabled={false}>{children}</ClerkAvailabilityProvider>;
  }

  return (
    <LocalizedClerkProvider publishableKey={publishableKey}>
      <ClerkAvailabilityProvider enabled>{children}</ClerkAvailabilityProvider>
    </LocalizedClerkProvider>
  );
}
