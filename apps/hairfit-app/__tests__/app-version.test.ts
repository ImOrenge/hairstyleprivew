import {
  GOOGLE_PLAY_PACKAGE_NAME,
  GOOGLE_PLAY_STORE_URL,
} from "@hairfit/shared";
import { googlePlayMarketUrl, parseMobileAppVersionStatus } from "../lib/app-version";

const validStatus = {
  platform: "android" as const,
  packageName: GOOGLE_PLAY_PACKAGE_NAME,
  track: "production" as const,
  latestVersionCode: 6,
  latestVersionName: "1.6.0",
  minimumVersionCode: 4,
  updatePriority: 3,
  storeUrl: GOOGLE_PLAY_STORE_URL,
  checkedAt: "2026-08-01T00:00:00.000Z",
};

describe("app version response", () => {
  test("accepts the HairFit production response", () => {
    expect(parseMobileAppVersionStatus(validStatus)).toEqual(validStatus);
    expect(googlePlayMarketUrl()).toBe(`market://details?id=${GOOGLE_PLAY_PACKAGE_NAME}`);
  });

  test("rejects another package, track, or unsafe store URL", () => {
    expect(parseMobileAppVersionStatus({ ...validStatus, packageName: "example.other" })).toBeNull();
    expect(parseMobileAppVersionStatus({ ...validStatus, track: "internal" })).toBeNull();
    expect(parseMobileAppVersionStatus({ ...validStatus, storeUrl: "https://example.com" })).toBeNull();
  });

  test("rejects malformed version codes and priorities", () => {
    expect(parseMobileAppVersionStatus({ ...validStatus, latestVersionCode: 0 })).toBeNull();
    expect(parseMobileAppVersionStatus({ ...validStatus, minimumVersionCode: "4" })).toBeNull();
    expect(parseMobileAppVersionStatus({ ...validStatus, updatePriority: 6 })).toBeNull();
  });
});
