import { ClerkProvider, useAuth, useUser } from "@clerk/clerk-expo";
import { Slot, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { HeaderNavigationProvider, type HeaderMenuItem } from "@hairfit/ui-native";
import type { MobileBootstrap } from "@hairfit/shared";
import { GenerationFlowProvider } from "../lib/generation-flow";
import { useHairfitApi } from "../lib/api";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

const tokenCache = {
  async getToken(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key: string, value: string) {
    return SecureStore.setItemAsync(key, value);
  },
};

type AccountType = MobileBootstrap["accountType"];

function normalizeAccountType(value: unknown): AccountType {
  if (value === "member" || value === "salon_owner" || value === "admin") {
    return value;
  }

  return null;
}

function servicesForAccount(accountType: AccountType): MobileBootstrap["services"] {
  if (accountType === "admin") {
    return ["customer", "salon", "admin"];
  }

  if (accountType === "salon_owner") {
    return ["salon"];
  }

  return ["customer"];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readMetadataValue(source: unknown, key: "accountType" | "onboardingComplete") {
  const record = asRecord(source);
  if (!record) {
    return undefined;
  }

  const nestedSources = [
    record,
    asRecord(record.metadata),
    asRecord(record.publicMetadata),
    asRecord(record.public_metadata),
  ];

  for (const nested of nestedSources) {
    if (nested && key in nested) {
      return nested[key];
    }
  }

  return undefined;
}

function getAccountHomePath(me: MobileBootstrap | null) {
  if (!me?.onboardingComplete || !me.accountType) {
    return "/onboarding";
  }

  if (me.accountType === "admin") {
    return "/admin/stats";
  }

  if (me.accountType === "salon_owner") {
    return "/salon/customers";
  }

  return "/";
}

function getMenuItems({
  isRoleLoaded,
  isSignedIn,
  me,
}: {
  isRoleLoaded: boolean;
  isSignedIn: boolean;
  me: MobileBootstrap | null;
}): HeaderMenuItem[] {
  if (!isSignedIn) {
    return [{ label: "회원가입", path: "/signup" }];
  }

  if (!isRoleLoaded) {
    return [];
  }

  if (!me?.onboardingComplete || !me.accountType) {
    return [{ label: "계정 설정", path: "/onboarding" }];
  }

  if (me.accountType === "admin") {
    return [
      { label: "Admin", path: "/admin/stats" },
      { label: "마이페이지", path: "/mypage" },
      { label: "Salon CRM", path: "/salon/customers" },
    ];
  }

  if (me.accountType === "salon_owner") {
    return [{ label: "Salon CRM", path: "/salon/customers" }];
  }

  return [
    { label: "홈", path: "/" },
    { label: "헤어 생성", path: "/upload" },
    { label: "마이페이지", path: "/mypage" },
  ];
}

function AppProviders() {
  const router = useRouter();
  const api = useHairfitApi();
  const { isLoaded, isSignedIn, sessionClaims, signOut, userId } = useAuth();
  const { user } = useUser();
  const [me, setMe] = useState<MobileBootstrap | null>(null);
  const [isRoleLoaded, setIsRoleLoaded] = useState(false);
  const metadataAccountType = normalizeAccountType(
    user?.publicMetadata?.accountType ?? readMetadataValue(sessionClaims, "accountType"),
  );
  const metadataOnboardingComplete = Boolean(
    (user?.publicMetadata?.onboardingComplete === true ||
      readMetadataValue(sessionClaims, "onboardingComplete") === true) &&
      metadataAccountType,
  );
  const userEmail =
    user?.primaryEmailAddress?.emailAddress?.trim() ||
    user?.emailAddresses?.[0]?.emailAddress?.trim() ||
    null;
  const userDisplayName = user?.fullName?.trim() || user?.firstName?.trim() || user?.username?.trim() || null;
  const fallbackMe = useMemo<MobileBootstrap | null>(() => {
    if (!userId) {
      return null;
    }

    return {
      userId,
      email: userEmail,
      displayName: userDisplayName,
      accountType: metadataAccountType,
      onboardingComplete: metadataOnboardingComplete,
      credits: 0,
      planKey: null,
      services: servicesForAccount(metadataAccountType),
    };
  }, [metadataAccountType, metadataOnboardingComplete, userDisplayName, userEmail, userId]);

  useEffect(() => {
    let cancelled = false;

    async function loadMe() {
      if (!isLoaded) {
        setIsRoleLoaded(false);
        return;
      }

      if (!isLoaded || !isSignedIn) {
        setMe(null);
        setIsRoleLoaded(true);
        return;
      }

      setIsRoleLoaded(false);
      const fallbackTimer = setTimeout(() => {
        if (!cancelled) {
          setMe(fallbackMe);
          setIsRoleLoaded(true);
        }
      }, 2500);

      try {
        const result = await api.getMobileMe();
        clearTimeout(fallbackTimer);
        if (!cancelled) {
          setMe(result);
          setIsRoleLoaded(true);
        }
      } catch {
        clearTimeout(fallbackTimer);
        if (!cancelled) {
          setMe(fallbackMe);
          setIsRoleLoaded(true);
        }
      }
    }

    void loadMe();
    return () => {
      cancelled = true;
    };
  }, [api, fallbackMe, isLoaded, isSignedIn]);

  const headerNavigation = useMemo(
    () => ({
      brandPath: Boolean(isLoaded && isSignedIn) && isRoleLoaded ? getAccountHomePath(me) : "/",
      isSignedIn: Boolean(isLoaded && isSignedIn),
      menuItems: getMenuItems({ isRoleLoaded, isSignedIn: Boolean(isLoaded && isSignedIn), me }),
      onSignOut: async () => {
        await signOut();
        router.replace("/login");
      },
    }),
    [isLoaded, isRoleLoaded, isSignedIn, me, router, signOut],
  );

  return (
    <HeaderNavigationProvider value={headerNavigation}>
      <GenerationFlowProvider>
        <Slot />
      </GenerationFlowProvider>
    </HeaderNavigationProvider>
  );
}

export default function CustomerLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <StatusBar hidden style="light" />
      <AppProviders />
    </ClerkProvider>
  );
}
