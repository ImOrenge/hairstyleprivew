import type {
  MobilePushDeviceRegistrationRequest,
  MobilePushDeviceRegistrationResponse,
  MobilePushDeviceStatusResponse,
} from "@hairfit/shared";
import {
  getMobileApiContext,
  mobileCorsPreflightResponse,
  mobileJsonResponse,
} from "../../../../lib/mobile-auth";
import { callSupabaseRpc } from "../../../../lib/supabase-rpc";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXPO_PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/;
const REASON_PATTERN = /^[a-z0-9_-]{1,64}$/i;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstRow(value: unknown) {
  return Array.isArray(value) && isObject(value[0]) ? value[0] : null;
}

function parseRegistration(value: unknown): MobilePushDeviceRegistrationRequest | null {
  if (!isObject(value)) return null;

  const installationId = text(value.installationId).toLowerCase();
  const expoPushToken = text(value.expoPushToken);
  const nativePushToken = text(value.nativePushToken) || null;
  const platform = value.platform;
  const projectId = text(value.projectId);
  const appVersion = text(value.appVersion) || null;

  if (
    !UUID_PATTERN.test(installationId) ||
    !EXPO_PUSH_TOKEN_PATTERN.test(expoPushToken) ||
    (platform !== "ios" && platform !== "android") ||
    !projectId ||
    projectId.length > 128 ||
    (nativePushToken && nativePushToken.length > 1024) ||
    (appVersion && appVersion.length > 64)
  ) {
    return null;
  }

  return {
    installationId,
    expoPushToken,
    nativePushToken,
    platform,
    projectId,
    appVersion,
  };
}

export function OPTIONS(request: Request) {
  return mobileCorsPreflightResponse(request);
}

export async function GET(request: Request) {
  const context = await getMobileApiContext(request);
  if (!context.ok) return context.response;

  const installationId = new URL(request.url).searchParams.get("installationId")?.trim().toLowerCase() ?? "";
  if (!UUID_PATTERN.test(installationId)) {
    return mobileJsonResponse(request, { error: "installationId is invalid" }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("mobile_push_devices")
    .select("installation_id,push_enabled,permission_status,last_registered_at,invalid_reason")
    .eq("user_id", context.userId)
    .eq("installation_id", installationId)
    .maybeSingle();

  if (error) {
    console.error("[mobile/push-devices] status read failed", {
      userId: context.userId,
      installationId,
      error: error.message,
    });
    return mobileJsonResponse(
      request,
      { error: "알림 설정을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 503 },
    );
  }

  const response: MobilePushDeviceStatusResponse = {
    installationId,
    registered: Boolean(data),
    enabled: data?.push_enabled === true,
    permissionStatus:
      data?.permission_status === "granted" ||
      data?.permission_status === "denied" ||
      data?.permission_status === "undetermined"
        ? data.permission_status
        : "undetermined",
    lastRegisteredAt:
      typeof data?.last_registered_at === "string" ? data.last_registered_at : null,
    invalidReason: typeof data?.invalid_reason === "string" ? data.invalid_reason : null,
  };
  return mobileJsonResponse(request, response);
}

export async function POST(request: Request) {
  const context = await getMobileApiContext(request);
  if (!context.ok) return context.response;

  const registration = parseRegistration(await request.json().catch(() => null));
  if (!registration) {
    return mobileJsonResponse(request, { error: "알림 기기 정보가 올바르지 않습니다." }, { status: 400 });
  }

  const { data, error } = await callSupabaseRpc(
    context.supabase,
    "register_mobile_push_device",
    {
      p_user_id: context.userId,
      p_installation_id: registration.installationId,
      p_expo_push_token: registration.expoPushToken,
      p_native_push_token: registration.nativePushToken ?? null,
      p_platform: registration.platform,
      p_project_id: registration.projectId,
      p_app_version: registration.appVersion ?? null,
    },
  );
  const row = firstRow(data);

  if (error || !row) {
    console.error("[mobile/push-devices] registration failed", {
      userId: context.userId,
      installationId: registration.installationId,
      error: error?.message ?? "empty registration result",
    });
    return mobileJsonResponse(
      request,
      { error: "완료 알림을 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 503 },
    );
  }

  const response: MobilePushDeviceRegistrationResponse = {
    deviceId: text(row.device_id),
    installationId: registration.installationId,
    enabled: row.push_enabled === true,
    permissionStatus: row.permission_status === "granted" ? "granted" : "undetermined",
    registeredAt: text(row.registered_at),
  };
  return mobileJsonResponse(request, response, { status: 200 });
}

export async function DELETE(request: Request) {
  const context = await getMobileApiContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => null);
  const installationId = isObject(body) ? text(body.installationId).toLowerCase() : "";
  const requestedReason = isObject(body) ? text(body.reason) : "";
  const reason = REASON_PATTERN.test(requestedReason) ? requestedReason : "user_disabled";

  if (!UUID_PATTERN.test(installationId)) {
    return mobileJsonResponse(request, { error: "installationId is invalid" }, { status: 400 });
  }

  const { error } = await callSupabaseRpc(context.supabase, "revoke_mobile_push_device", {
    p_user_id: context.userId,
    p_installation_id: installationId,
    p_reason: reason,
  });
  if (error) {
    console.error("[mobile/push-devices] revocation failed", {
      userId: context.userId,
      installationId,
      error: error.message,
    });
    return mobileJsonResponse(
      request,
      { error: "알림 연결을 해제하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 503 },
    );
  }

  return mobileJsonResponse(request, { installationId, revoked: true });
}
