import type { HairfitApiClient } from "@hairfit/api-client";
import {
  createGenerationResumeTarget,
  resumeTargetToPath,
  type MobilePushPermissionStatus,
} from "@hairfit/shared";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Linking, Platform } from "react-native";

const INSTALLATION_ID_KEY = "hairfit.push-installation-id.v1";
const PUSH_OPT_IN_KEY = "hairfit.push-opt-in.v1";
export const GENERATION_PUSH_CHANNEL_ID = "generation-completion";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PushNotificationUiStatus =
  | "loading"
  | "unsupported"
  | "unavailable"
  | "disabled"
  | "undetermined"
  | "denied"
  | "registering"
  | "enabled"
  | "error";

export interface PushNotificationRegistrationResult {
  status: PushNotificationUiStatus;
  installationId: string | null;
  permissionStatus: MobilePushPermissionStatus;
  message: string | null;
}

export interface PushStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const securePushStorage: PushStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
};

export function normalizeInstallationId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

export function createPushInstallationStore(storage: PushStorage) {
  return {
    async getOrCreate() {
      const current = normalizeInstallationId(await storage.getItem(INSTALLATION_ID_KEY));
      if (current) return current;

      const created = Crypto.randomUUID().toLowerCase();
      await storage.setItem(INSTALLATION_ID_KEY, created);
      return created;
    },
    async readOptIn() {
      return (await storage.getItem(PUSH_OPT_IN_KEY)) === "enabled";
    },
    async setOptIn(enabled: boolean) {
      await storage.setItem(PUSH_OPT_IN_KEY, enabled ? "enabled" : "disabled");
    },
  };
}

export const pushInstallationStore = createPushInstallationStore(securePushStorage);

export function resolveGenerationPushTarget(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  if (record.type !== "generation_terminal") return null;
  const target = createGenerationResumeTarget(record.generationId);
  if (!target) return null;

  const path = resumeTargetToPath(target);
  if (!path || record.path !== path) return null;
  return { target, path };
}

export function getPushProjectId() {
  const fromExtra = Constants.expoConfig?.extra?.eas;
  const extraProjectId =
    fromExtra && typeof fromExtra === "object" && "projectId" in fromExtra
      ? (fromExtra as { projectId?: unknown }).projectId
      : null;
  const projectId =
    (typeof extraProjectId === "string" ? extraProjectId : null) ??
    Constants.easConfig?.projectId ??
    null;
  return typeof projectId === "string" && projectId.trim() ? projectId.trim() : null;
}

function normalizePermissionStatus(
  status: Notifications.PermissionStatus,
): MobilePushPermissionStatus {
  if (status === Notifications.PermissionStatus.GRANTED) return "granted";
  if (status === Notifications.PermissionStatus.DENIED) return "denied";
  return "undetermined";
}

async function configureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(GENERATION_PUSH_CHANNEL_ID, {
    name: "헤어 생성 완료",
    description: "예약한 헤어스타일 생성 결과와 실패 복구 안내",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250],
    lightColor: "#7C3AED",
    sound: "default",
    enableVibrate: true,
    showBadge: true,
  });
}

function nativeTokenText(value: Notifications.DevicePushToken | null) {
  if (!value) return null;
  if (typeof value.data === "string") return value.data;
  try {
    return JSON.stringify(value.data);
  } catch {
    return null;
  }
}

function unavailable(message: string): PushNotificationRegistrationResult {
  return {
    status: "unavailable",
    installationId: null,
    permissionStatus: "undetermined",
    message,
  };
}

async function registerGrantedDevice(api: HairfitApiClient) {
  const projectId = getPushProjectId();
  if (!projectId) {
    return unavailable("앱 알림 프로젝트 설정이 아직 준비되지 않았습니다. 이메일과 앱 내 진행 상태는 계속 제공됩니다.");
  }

  const installationId = await pushInstallationStore.getOrCreate();
  const [expoToken, nativeToken] = await Promise.all([
    Notifications.getExpoPushTokenAsync({ projectId }),
    Notifications.getDevicePushTokenAsync().catch(() => null),
  ]);
  await api.registerMobilePushDevice({
    installationId,
    expoPushToken: expoToken.data,
    nativePushToken: nativeTokenText(nativeToken),
    platform: Platform.OS as "ios" | "android",
    projectId,
    appVersion: Constants.expoConfig?.version ?? null,
  });
  await pushInstallationStore.setOptIn(true);

  return {
    status: "enabled" as const,
    installationId,
    permissionStatus: "granted" as const,
    message: null,
  };
}

export async function enableGenerationPushNotifications(api: HairfitApiClient) {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return unavailable("현재 기기에서는 앱 알림을 사용할 수 없습니다.");
  }
  if (!Device.isDevice) {
    return unavailable("원격 알림은 iOS 또는 Android 실제 기기에서 설정할 수 있습니다.");
  }

  await configureAndroidChannel();
  const current = await Notifications.getPermissionsAsync();
  const permission =
    current.status === Notifications.PermissionStatus.GRANTED
      ? current
      : await Notifications.requestPermissionsAsync();
  const permissionStatus = normalizePermissionStatus(permission.status);

  if (permissionStatus !== "granted") {
    await pushInstallationStore.setOptIn(false);
    return {
      status: permissionStatus === "denied" ? "denied" : "undetermined",
      installationId: null,
      permissionStatus,
      message:
        permissionStatus === "denied"
          ? "알림 권한이 꺼져 있습니다. 이메일과 앱 내 진행 상태로 완료를 확인할 수 있습니다."
          : "알림 권한을 허용하면 생성 완료 후 앱을 닫아도 알려드릴 수 있습니다.",
    } satisfies PushNotificationRegistrationResult;
  }

  return registerGrantedDevice(api);
}

export async function syncGenerationPushNotifications(api: HairfitApiClient) {
  if (!(await pushInstallationStore.readOptIn())) {
    return {
      status: "disabled",
      installationId: null,
      permissionStatus: "undetermined",
      message: null,
    } satisfies PushNotificationRegistrationResult;
  }
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return unavailable("현재 기기에서는 앱 알림을 사용할 수 없습니다.");
  }
  if (!Device.isDevice) {
    return unavailable("원격 알림은 iOS 또는 Android 실제 기기에서 설정할 수 있습니다.");
  }

  await configureAndroidChannel();
  const permission = await Notifications.getPermissionsAsync();
  const permissionStatus = normalizePermissionStatus(permission.status);
  if (permissionStatus !== "granted") {
    await pushInstallationStore.setOptIn(false);
    return {
      status: permissionStatus === "denied" ? "denied" : "undetermined",
      installationId: null,
      permissionStatus,
      message: "앱 알림 권한이 변경되어 완료 알림 연결을 중지했습니다.",
    } satisfies PushNotificationRegistrationResult;
  }

  return registerGrantedDevice(api);
}

export async function disableGenerationPushNotifications(
  api: HairfitApiClient,
  reason = "user_disabled",
) {
  const installationId = await pushInstallationStore.getOrCreate();
  await api.revokeMobilePushDevice(installationId, reason);
  await pushInstallationStore.setOptIn(false);
  await Notifications.setBadgeCountAsync(0).catch(() => false);
  return installationId;
}

export async function clearGenerationPushAccountState() {
  await pushInstallationStore.setOptIn(false);
  await Notifications.setBadgeCountAsync(0).catch(() => false);
}

export function openPushNotificationSettings() {
  return Linking.openSettings();
}
