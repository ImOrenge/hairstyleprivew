import {
  GOOGLE_PLAY_PACKAGE_NAME,
  GOOGLE_PLAY_STORE_URL,
  type MobileAppVersionStatus,
} from "@hairfit/shared";

function positiveInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function parseMobileAppVersionStatus(value: unknown): MobileAppVersionStatus | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<MobileAppVersionStatus>;
  if (
    candidate.platform !== "android" ||
    candidate.packageName !== GOOGLE_PLAY_PACKAGE_NAME ||
    candidate.track !== "production" ||
    !positiveInteger(candidate.latestVersionCode) ||
    (candidate.minimumVersionCode !== null && !positiveInteger(candidate.minimumVersionCode)) ||
    typeof candidate.updatePriority !== "number" ||
    candidate.updatePriority < 0 ||
    candidate.updatePriority > 5 ||
    candidate.storeUrl !== GOOGLE_PLAY_STORE_URL ||
    typeof candidate.checkedAt !== "string"
  ) {
    return null;
  }
  if (candidate.latestVersionName !== null && typeof candidate.latestVersionName !== "string") {
    return null;
  }

  return candidate as MobileAppVersionStatus;
}

export function googlePlayMarketUrl() {
  return `market://details?id=${GOOGLE_PLAY_PACKAGE_NAME}`;
}
