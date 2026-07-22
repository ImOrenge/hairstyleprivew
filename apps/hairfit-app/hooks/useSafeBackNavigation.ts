import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { BackHandler, Platform } from "react-native";

export type SafeBackNavigationMode = "history" | "replace";

interface UseSafeBackNavigationOptions {
  blocked?: boolean;
  enabled?: boolean;
  fallback: Href;
  mode?: SafeBackNavigationMode;
  onBeforeNavigate?: () => boolean;
  onBlocked?: () => void;
}

interface SafeBackRouter {
  back: () => void;
  canGoBack: () => boolean;
  replace: (href: Href) => void;
}

interface ConsumeSafeBackNavigationOptions
  extends Omit<UseSafeBackNavigationOptions, "enabled"> {
  router: SafeBackRouter;
}

export function consumeSafeBackNavigation({
  blocked = false,
  fallback,
  mode = "history",
  onBeforeNavigate,
  onBlocked,
  router,
}: ConsumeSafeBackNavigationOptions) {
  if (blocked) {
    onBlocked?.();
    return true;
  }

  if (onBeforeNavigate?.()) {
    return true;
  }

  if (mode === "history" && router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback);
  }
  return true;
}

/**
 * Keeps Android hardware back and visible back buttons on the same safe path.
 * Returning true means the current screen consumed the navigation request.
 */
export function useSafeBackNavigation({
  blocked = false,
  enabled = true,
  fallback,
  mode = "history",
  onBeforeNavigate,
  onBlocked,
}: UseSafeBackNavigationOptions) {
  const router = useRouter();

  const navigateBack = useCallback(
    () => consumeSafeBackNavigation({
      blocked,
      fallback,
      mode,
      onBeforeNavigate,
      onBlocked,
      router,
    }),
    [blocked, fallback, mode, onBeforeNavigate, onBlocked, router],
  );

  useFocusEffect(
    useCallback(() => {
      if (!enabled || Platform.OS !== "android") return undefined;
      const subscription = BackHandler.addEventListener("hardwareBackPress", navigateBack);
      return () => subscription.remove();
    }, [enabled, navigateBack]),
  );

  return navigateBack;
}
