const IOS_BUNDLE_ID = "com.hairfit.app";
const ANDROID_PACKAGE_NAME = "com.hairfit.app";
const APPLE_TEAM_ID_PATTERN = /^[A-Z0-9]{10}$/;
const ANDROID_SHA256_PATTERN = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function buildAppleAppSiteAssociation(teamId: string | null | undefined) {
  const normalizedTeamId = teamId?.trim().toUpperCase() ?? "";
  if (!APPLE_TEAM_ID_PATTERN.test(normalizedTeamId)) return null;
  return {
    applinks: {
      apps: [],
      details: [
        {
          appID: `${normalizedTeamId}.${IOS_BUNDLE_ID}`,
          paths: ["/generate/*"],
        },
      ],
    },
  };
}

export function buildAndroidAssetLinks(fingerprint: string | null | undefined) {
  const normalizedFingerprint = fingerprint?.trim().toUpperCase() ?? "";
  if (!ANDROID_SHA256_PATTERN.test(normalizedFingerprint)) return null;
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: ANDROID_PACKAGE_NAME,
        sha256_cert_fingerprints: [normalizedFingerprint],
      },
    },
  ];
}
