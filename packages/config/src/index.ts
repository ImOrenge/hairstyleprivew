export interface MobileRuntimeConfig {
  apiBaseUrl: string;
  clerkPublishableKey: string;
  portoneStoreId?: string;
  portoneChannelKey?: string;
}

export function requireMobileRuntimeConfig(env: Record<string, string | undefined>): MobileRuntimeConfig {
  const apiBaseUrl = env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const clerkPublishableKey = env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();

  if (!apiBaseUrl) {
    throw new Error("Missing EXPO_PUBLIC_API_BASE_URL");
  }
  if (!clerkPublishableKey) {
    throw new Error("Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY");
  }

  return {
    apiBaseUrl,
    clerkPublishableKey,
    portoneStoreId: env.EXPO_PUBLIC_PORTONE_STORE_ID?.trim(),
    portoneChannelKey: env.EXPO_PUBLIC_PORTONE_CHANNEL_KEY?.trim(),
  };
}
