"use client";

import { createContext, type ReactNode, useContext } from "react";

const ClerkAvailabilityContext = createContext(false);

export function ClerkAvailabilityProvider({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  return (
    <ClerkAvailabilityContext.Provider value={enabled}>
      {children}
    </ClerkAvailabilityContext.Provider>
  );
}

export function useClerkAvailable() {
  return useContext(ClerkAvailabilityContext);
}
