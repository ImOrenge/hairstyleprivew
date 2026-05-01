import { useAuth } from "@clerk/clerk-expo";
import { HairfitApiClient } from "@hairfit/api-client";
import Constants from "expo-constants";
import { useMemo } from "react";

function readApiBaseUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const fromExtra = typeof Constants.expoConfig?.extra?.apiBaseUrl === "string"
    ? Constants.expoConfig.extra.apiBaseUrl.trim()
    : "";

  return fromEnv || fromExtra || "http://localhost:3000";
}

export function useHairfitApi() {
  const { getToken } = useAuth();
  const baseUrl = readApiBaseUrl();

  return useMemo(
    () =>
      new HairfitApiClient({
        baseUrl,
        getAuthToken: () => getToken(),
      }),
    [baseUrl, getToken],
  );
}
