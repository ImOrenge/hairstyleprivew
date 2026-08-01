import {
  GOOGLE_PLAY_PACKAGE_NAME,
  GOOGLE_PLAY_STORE_URL,
  type MobileAppVersionStatus,
} from "@hairfit/shared";
import { NextResponse } from "next/server";
import {
  getGooglePlayProductionRelease,
  isGooglePlayApiConfigured,
} from "../../../../lib/google-play-api";

export const dynamic = "force-dynamic";

function minimumVersionCode() {
  const raw = process.env.GOOGLE_PLAY_MINIMUM_VERSION_CODE?.trim();
  if (!raw) return null;
  if (!/^\d+$/u.test(raw)) throw new Error("GOOGLE_PLAY_MINIMUM_VERSION_CODE must be an integer");
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("GOOGLE_PLAY_MINIMUM_VERSION_CODE must be a positive integer");
  }
  return parsed;
}

export async function GET() {
  if (!isGooglePlayApiConfigured()) {
    return NextResponse.json(
      { error: "Google Play 버전 조회가 아직 설정되지 않았습니다." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const release = await getGooglePlayProductionRelease();
    const minimum = minimumVersionCode();
    if (minimum !== null && minimum > release.versionCode) {
      throw new Error("GOOGLE_PLAY_MINIMUM_VERSION_CODE exceeds the active production version");
    }
    const payload: MobileAppVersionStatus = {
      platform: "android",
      packageName: GOOGLE_PLAY_PACKAGE_NAME,
      track: "production",
      latestVersionCode: release.versionCode,
      latestVersionName: release.versionName,
      minimumVersionCode: minimum,
      updatePriority: release.updatePriority,
      storeUrl: GOOGLE_PLAY_STORE_URL,
      checkedAt: new Date().toISOString(),
    };

    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch {
    return NextResponse.json(
      { error: "Google Play 최신 버전을 확인하지 못했습니다." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
