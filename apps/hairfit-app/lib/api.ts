import { useAuth } from "@clerk/clerk-expo";
import { HairfitApiClient } from "@hairfit/api-client";
import Constants from "expo-constants";
import { useMemo, useRef } from "react";
import { Platform } from "react-native";

const PRODUCTION_API_BASE_URL = "https://hairfit.beauty";

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function readApiBaseUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const fromExtra = typeof Constants.expoConfig?.extra?.apiBaseUrl === "string"
    ? Constants.expoConfig.extra.apiBaseUrl.trim()
    : "";

  if (fromEnv || fromExtra) {
    return normalizeBaseUrl(fromEnv || fromExtra);
  }

  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_API_BASE_URL;
  }

  return Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000";
}

export function getHairfitApiBaseUrl() {
  return readApiBaseUrl();
}

export function useHairfitApi() {
  const { getToken } = useAuth();
  const baseUrl = getHairfitApiBaseUrl();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  return useMemo(
    () =>
      new HairfitApiClient({
        baseUrl,
        getAuthToken: (options) => getTokenRef.current(options),
      }),
    [baseUrl],
  );
}
