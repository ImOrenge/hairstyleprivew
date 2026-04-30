"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { koreanClerkLocalization } from "../../lib/clerk-localization";
import { useLocaleStore } from "../../lib/i18n/useLocaleStore";

type LocalizedClerkProviderProps = {
  children: ReactNode;
  publishableKey: string;
};

export function LocalizedClerkProvider({ children, publishableKey }: LocalizedClerkProviderProps) {
  const locale = useLocaleStore((state) => state.locale);
  const localization = locale === "ko" ? koreanClerkLocalization : undefined;

  return (
    <ClerkProvider publishableKey={publishableKey} localization={localization}>
      {children}
    </ClerkProvider>
  );
}
