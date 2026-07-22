import { useAuth } from "@clerk/clerk-expo";
import { type Href, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import { pendingResumeStore } from "../../lib/auth-resume";
import { useHairfitApi } from "../../lib/api";
import {
  disableGenerationPushNotifications,
  enableGenerationPushNotifications,
  openPushNotificationSettings,
  resolveGenerationPushTarget,
  syncGenerationPushNotifications,
  type PushNotificationRegistrationResult,
  type PushNotificationUiStatus,
} from "../../lib/push-notifications";

if (Platform.OS === "ios" || Platform.OS === "android") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

interface PushNotificationContextValue {
  status: PushNotificationUiStatus;
  message: string | null;
  installationId: string | null;
  enable(): Promise<boolean>;
  disable(reason?: string): Promise<boolean>;
  refresh(): Promise<void>;
  openSettings(): Promise<void>;
}

const PushNotificationContext = createContext<PushNotificationContextValue | null>(null);

function safeErrorMessage(error: unknown) {
  if (error instanceof Error && /project|configuration|credential/i.test(error.message)) {
    return "앱 알림 연결 설정이 아직 준비되지 않았습니다. 이메일과 앱 내 진행 상태는 계속 제공됩니다.";
  }
  return "완료 알림 설정을 변경하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.";
}

export function PushNotificationProvider({ children }: { children: ReactNode }) {
  const api = useHairfitApi();
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [state, setState] = useState<PushNotificationRegistrationResult>({
    status: "loading",
    installationId: null,
    permissionStatus: "undetermined",
    message: null,
  });
  const handledResponseId = useRef<string | null>(null);

  const apply = useCallback((result: PushNotificationRegistrationResult) => {
    setState(result);
    return result;
  }, []);

  const refresh = useCallback(async () => {
    if (!isLoaded || !isSignedIn) {
      setState((current) => ({ ...current, status: "disabled", message: null }));
      return;
    }
    try {
      apply(await syncGenerationPushNotifications(api));
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        message: safeErrorMessage(error),
      }));
    }
  }, [api, apply, isLoaded, isSignedIn]);

  const enable = useCallback(async () => {
    if (!isSignedIn) return false;
    setState((current) => ({ ...current, status: "registering", message: null }));
    try {
      const result = apply(await enableGenerationPushNotifications(api));
      return result.status === "enabled";
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        message: safeErrorMessage(error),
      }));
      return false;
    }
  }, [api, apply, isSignedIn]);

  const disable = useCallback(
    async (reason = "user_disabled") => {
      if (!isSignedIn) return true;
      setState((current) => ({ ...current, status: "registering", message: null }));
      try {
        const installationId = await disableGenerationPushNotifications(api, reason);
        setState({
          status: "disabled",
          installationId,
          permissionStatus: "granted",
          message: null,
        });
        return true;
      } catch (error) {
        setState((current) => ({
          ...current,
          status: "error",
          message: safeErrorMessage(error),
        }));
        return false;
      }
    },
    [api, isSignedIn],
  );

  const handleResponse = useCallback(
    async (response: Notifications.NotificationResponse) => {
      const responseId = response.notification.request.identifier;
      if (handledResponseId.current === responseId) return;

      const resolved = resolveGenerationPushTarget(response.notification.request.content.data);
      if (!resolved) return;
      handledResponseId.current = responseId;
      Notifications.clearLastNotificationResponse();
      await Notifications.setBadgeCountAsync(0).catch(() => false);

      if (isSignedIn) {
        router.push(resolved.path as Href);
        return;
      }

      await pendingResumeStore.save(resolved.target);
      router.push("/login" as Href);
    },
    [isSignedIn, router],
  );

  useEffect(() => {
    if (!isLoaded) return;
    void refresh();
  }, [isLoaded, isSignedIn, refresh]);

  useEffect(() => {
    if (!isLoaded || (Platform.OS !== "ios" && Platform.OS !== "android")) return;

    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse) void handleResponse(lastResponse);
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleResponse(response);
    });
    return () => subscription.remove();
  }, [handleResponse, isLoaded]);

  const value = useMemo<PushNotificationContextValue>(
    () => ({
      status: state.status,
      message: state.message,
      installationId: state.installationId,
      enable,
      disable,
      refresh,
      openSettings: openPushNotificationSettings,
    }),
    [disable, enable, refresh, state.installationId, state.message, state.status],
  );

  return (
    <PushNotificationContext.Provider value={value}>
      {children}
    </PushNotificationContext.Provider>
  );
}

export function usePushNotifications() {
  const context = useContext(PushNotificationContext);
  if (!context) {
    throw new Error("usePushNotifications must be used inside PushNotificationProvider");
  }
  return context;
}
