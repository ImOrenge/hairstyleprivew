import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { getClerkConfigState } from "../../lib/clerk";

export default function AuthLayout({ children }: { children: ReactNode }) {
  const { canUseClerkFrontend, publishableKey } = getClerkConfigState();

  if (!canUseClerkFrontend || !publishableKey) {
    return children;
  }

  return <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider>;
}
