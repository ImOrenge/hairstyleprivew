#!/usr/bin/env node

const IOS_BUNDLE_ID = "com.hairfit.app";
const ANDROID_PACKAGE_NAME = "com.hairfit.app";
const APPLE_TEAM_ID_PATTERN = /^[A-Z0-9]{10}$/;
const ANDROID_SHA256_PATTERN = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const ASSOCIATION_PATHS = {
  apple: "/.well-known/apple-app-site-association",
  android: "/.well-known/assetlinks.json",
};

function argValue(name, fallback = "") {
  const direct = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")
    ? process.argv[index + 1]
    : fallback;
}

function associationOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("--baseUrl must be a valid absolute URL");
  }

  const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw new Error("association preflight requires HTTPS except for loopback development");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("--baseUrl must be an origin without credentials, path, query, or hash");
  }
  return url.origin;
}

function normalizeTeamId(value) {
  const normalized = value.trim().toUpperCase();
  return APPLE_TEAM_ID_PATTERN.test(normalized) ? normalized : null;
}

function normalizeFingerprint(value) {
  const normalized = value.trim().toUpperCase();
  return ANDROID_SHA256_PATTERN.test(normalized) ? normalized : null;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function loadAssociation(origin, path) {
  const response = await fetch(new URL(path, origin), {
    redirect: "manual",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  if (response.status >= 300 && response.status < 400) {
    throw new Error(`${path} redirected with HTTP ${response.status}`);
  }
  if (response.status !== 200) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`${path} returned non-JSON content type`);
  }

  try {
    return await response.json();
  } catch {
    throw new Error(`${path} returned invalid JSON`);
  }
}

function verifyAppleAssociation(payload, teamId) {
  if (!teamId) {
    throw new Error("HAIRFIT_APPLE_TEAM_ID or --appleTeamId must contain the operating 10-character Team ID");
  }
  if (!isRecord(payload) || !isRecord(payload.applinks) || !Array.isArray(payload.applinks.details)) {
    throw new Error("apple-app-site-association is missing applinks.details");
  }

  const expectedAppId = `${teamId}.${IOS_BUNDLE_ID}`;
  const detail = payload.applinks.details.find(
    (entry) => isRecord(entry) && entry.appID === expectedAppId,
  );
  if (!isRecord(detail) || !Array.isArray(detail.paths) || !detail.paths.includes("/generate/*")) {
    throw new Error("apple-app-site-association does not match the configured app ID and /generate/* path");
  }
}

function verifyAndroidAssociation(payload, fingerprint) {
  if (!fingerprint) {
    throw new Error("HAIRFIT_ANDROID_CERT_SHA256 or --androidCertSha256 must contain the operating release fingerprint");
  }
  if (!Array.isArray(payload)) {
    throw new Error("assetlinks.json must be a statement array");
  }

  const statement = payload.find(
    (entry) =>
      isRecord(entry) &&
      Array.isArray(entry.relation) &&
      entry.relation.includes("delegate_permission/common.handle_all_urls") &&
      isRecord(entry.target) &&
      entry.target.namespace === "android_app" &&
      entry.target.package_name === ANDROID_PACKAGE_NAME,
  );
  const fingerprints = isRecord(statement?.target)
    ? statement.target.sha256_cert_fingerprints
    : null;
  if (!Array.isArray(fingerprints) || !fingerprints.includes(fingerprint)) {
    throw new Error("assetlinks.json does not match the configured Android package and release fingerprint");
  }
}

const origin = associationOrigin(argValue("baseUrl", process.env.APP_LINK_BASE_URL ?? "https://hairfit.beauty"));
const teamId = normalizeTeamId(argValue("appleTeamId", process.env.HAIRFIT_APPLE_TEAM_ID ?? ""));
const fingerprint = normalizeFingerprint(
  argValue("androidCertSha256", process.env.HAIRFIT_ANDROID_CERT_SHA256 ?? ""),
);
const failures = [];

await Promise.all([
  loadAssociation(origin, ASSOCIATION_PATHS.apple)
    .then((payload) => verifyAppleAssociation(payload, teamId))
    .catch((error) => failures.push(error instanceof Error ? error.message : "Apple association check failed")),
  loadAssociation(origin, ASSOCIATION_PATHS.android)
    .then((payload) => verifyAndroidAssociation(payload, fingerprint))
    .catch((error) => failures.push(error instanceof Error ? error.message : "Android association check failed")),
]);

if (failures.length > 0) {
  throw new Error(`App-link external preflight failed for ${origin}:\n- ${failures.join("\n- ")}`);
}

console.log(`App-link external preflight passed for ${origin}.`);
