"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import type { AccountType } from "../../lib/onboarding";
import { useClerkAvailable } from "../providers/ClerkAvailabilityProvider";

interface OnboardingResponse {
  onboardingComplete?: boolean;
  accountType?: string | null;
}

interface VerifiedAccount {
  userId: string;
  accountType: AccountType | null;
  onboardingComplete: boolean;
}

interface HeaderAccountContextValue {
  hasClerkProvider: boolean;
  isAuthLoaded: boolean;
  isSignedIn: boolean;
  isRoleLoaded: boolean;
  accountType: AccountType | null;
  onboardingComplete: boolean;
  accountHomeHref: string;
}

const signedOutAccount: HeaderAccountContextValue = {
  hasClerkProvider: false,
  isAuthLoaded: true,
  isSignedIn: false,
  isRoleLoaded: true,
  accountType: null,
  onboardingComplete: false,
  accountHomeHref: "/login",
};

const HeaderAccountContext = createContext<HeaderAccountContextValue>(signedOutAccount);

function normalizeAccountType(value: unknown): AccountType | null {
  if (value === "member" || value === "salon_owner" || value === "admin") {
    return value;
  }

  return null;
}

function getAccountHomeHref(accountType: AccountType | null, onboardingComplete: boolean) {
  if (!onboardingComplete || !accountType) {
    return "/onboarding";
  }

  if (accountType === "salon_owner") {
    return "/salon/customers";
  }

  if (accountType === "admin") {
    return "/admin/stats";
  }

  return "/workspace";
}

function HeaderAccountProviderWithClerk({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [verifiedAccount, setVerifiedAccount] = useState<VerifiedAccount | null>(null);
  const userId = user?.id ?? null;

  const metadataAccountType = normalizeAccountType(user?.publicMetadata?.accountType);
  const metadataOnboardingComplete = Boolean(
    user?.publicMetadata?.onboardingComplete === true && metadataAccountType,
  );

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) {
      return;
    }

    let mounted = true;
    const activeUserId = userId;

    async function loadAccountType() {
      const fallbackAccount = {
        userId: activeUserId,
        accountType: metadataAccountType,
        onboardingComplete: metadataOnboardingComplete,
      };

      try {
        const response = await fetch("/api/onboarding", { cache: "no-store" });
        const data = (await response.json().catch(() => null)) as OnboardingResponse | null;

        if (!mounted) {
          return;
        }

        if (response.ok && data) {
          const accountType = normalizeAccountType(data.accountType);
          setVerifiedAccount({
            userId: activeUserId,
            accountType,
            onboardingComplete: Boolean(data.onboardingComplete && accountType),
          });
          return;
        }
      } catch {
        // Fall back to Clerk metadata below. Server-side middleware remains authoritative.
      }

      if (mounted) {
        setVerifiedAccount(fallbackAccount);
      }
    }

    void loadAccountType();

    return () => {
      mounted = false;
    };
  }, [isLoaded, isSignedIn, metadataAccountType, metadataOnboardingComplete, userId]);

  const value = useMemo<HeaderAccountContextValue>(() => {
    if (!isLoaded) {
      return {
        ...signedOutAccount,
        hasClerkProvider: true,
        isAuthLoaded: false,
        isRoleLoaded: false,
      };
    }

    if (!isSignedIn) {
      return {
        ...signedOutAccount,
        hasClerkProvider: true,
      };
    }

    const currentVerifiedAccount = verifiedAccount?.userId === userId ? verifiedAccount : null;
    const accountType = currentVerifiedAccount?.accountType ?? null;
    const onboardingComplete = currentVerifiedAccount?.onboardingComplete ?? false;

    return {
      hasClerkProvider: true,
      isAuthLoaded: true,
      isSignedIn: true,
      isRoleLoaded: Boolean(currentVerifiedAccount),
      accountType,
      onboardingComplete,
      accountHomeHref: getAccountHomeHref(accountType, onboardingComplete),
    };
  }, [isLoaded, isSignedIn, userId, verifiedAccount]);

  return (
    <HeaderAccountContext.Provider value={value}>
      {children}
    </HeaderAccountContext.Provider>
  );
}

export function HeaderAccountProvider({ children }: { children: ReactNode }) {
  const hasClerkProvider = useClerkAvailable();

  if (!hasClerkProvider) {
    return (
      <HeaderAccountContext.Provider value={signedOutAccount}>
        {children}
      </HeaderAccountContext.Provider>
    );
  }

  return <HeaderAccountProviderWithClerk>{children}</HeaderAccountProviderWithClerk>;
}

export function useHeaderAccount() {
  return useContext(HeaderAccountContext);
}
