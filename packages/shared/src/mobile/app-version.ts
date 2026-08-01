const GOOGLE_PLAY_PACKAGE_NAME = "com.hairfit.app";

export const GOOGLE_PLAY_STORE_URL =
  `https://play.google.com/store/apps/details?id=${GOOGLE_PLAY_PACKAGE_NAME}`;

export interface GooglePlayTrackRelease {
  name?: unknown;
  versionCodes?: unknown;
  status?: unknown;
  inAppUpdatePriority?: unknown;
}

export interface GooglePlayTrack {
  track?: unknown;
  releases?: unknown;
}

export interface GooglePlayProductionRelease {
  versionCode: number;
  versionName: string | null;
  updatePriority: number;
}

export interface MobileAppVersionStatus {
  platform: "android";
  packageName: string;
  track: "production";
  latestVersionCode: number;
  latestVersionName: string | null;
  minimumVersionCode: number | null;
  updatePriority: number;
  storeUrl: string;
  checkedAt: string;
}

export interface MobileAppUpdateDecision {
  available: boolean;
  required: boolean;
}

function positiveInteger(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value !== "string" || !/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function selectGooglePlayProductionRelease(
  tracks: readonly GooglePlayTrack[],
): GooglePlayProductionRelease | null {
  const production = tracks.find((track) => track.track === "production");
  if (!production || !Array.isArray(production.releases)) return null;

  let selected: GooglePlayProductionRelease | null = null;
  for (const rawRelease of production.releases) {
    if (!rawRelease || typeof rawRelease !== "object") continue;
    const release = rawRelease as GooglePlayTrackRelease;
    if (release.status !== "completed" && release.status !== "inProgress") continue;
    if (!Array.isArray(release.versionCodes)) continue;

    const versionCode = release.versionCodes
      .map(positiveInteger)
      .filter((value): value is number => value !== null)
      .reduce<number | null>((highest, value) => highest === null ? value : Math.max(highest, value), null);
    if (versionCode === null || (selected && selected.versionCode >= versionCode)) continue;

    const priority = positiveInteger(release.inAppUpdatePriority);
    selected = {
      versionCode,
      versionName: typeof release.name === "string" && release.name.trim()
        ? release.name.trim()
        : null,
      updatePriority: priority && priority <= 5 ? priority : 0,
    };
  }

  return selected;
}

export function evaluateMobileAppUpdate(
  installedVersionCode: string | number | null | undefined,
  status: Pick<MobileAppVersionStatus, "latestVersionCode" | "minimumVersionCode">,
): MobileAppUpdateDecision {
  const installed = positiveInteger(installedVersionCode);
  if (installed === null) return { available: false, required: false };

  return {
    available: installed < status.latestVersionCode,
    required: status.minimumVersionCode !== null && installed < status.minimumVersionCode,
  };
}
