import { useAuth } from "@clerk/clerk-expo";
import { HairfitApiClient } from "@hairfit/api-client";
import Constants from "expo-constants";
import { useMemo } from "react";
import { Platform } from "react-native";

function readApiBaseUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const fromExtra = typeof Constants.expoConfig?.extra?.apiBaseUrl === "string"
    ? Constants.expoConfig.extra.apiBaseUrl.trim()
    : "";

  if (fromEnv || fromExtra) {
    return fromEnv || fromExtra;
  }

  return Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000";
}

export function useHairfitApi() {
  const { getToken } = useAuth();
  const baseUrl = readApiBaseUrl();
  const shouldUseCookieSession = typeof window !== "undefined";
  const nativeGetToken = shouldUseCookieSession ? null : getToken;

  return useMemo(
    () =>
      new HairfitApiClient({
        baseUrl,
        getAuthToken: nativeGetToken ? () => nativeGetToken() : () => null,
      }),
    [baseUrl, nativeGetToken],
  );
}
