import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(appRoot, "..");

export const REQUIRED_LIVE_KEYS = Object.freeze([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "GOOGLE_API_KEY",
  "OPENAI_API_KEY",
  "PROMPT_VISION_MODEL",
  "PROMPT_LLM_MODEL",
  "PROMPT_RESEARCH_MODEL",
]);

export const EXPLICIT_ROLLOUT_FLAGS = Object.freeze([
  "NEXT_PUBLIC_CONSULTATION_FRONTEND_V2",
  "CATALOG_V2_ENABLED",
  "ENTITLEMENT_V2_DUAL_WRITE_ENABLED",
  "ENTITLEMENT_V2_SHADOW_READ_ENABLED",
  "ENTITLEMENT_V2_READ_ENABLED",
  "ENTITLEMENT_V2_LEGACY_BRIDGE_ENABLED",
  "CONSULTATION_SESSION_V2_ENABLED",
  "CONSULTATION_LIFECYCLE_NAV_V2_ENABLED",
  "CONSULTATION_ASYNC_ANALYSIS_V2_ENABLED",
  "CONSULTATION_LIVENESS_V2_ENABLED",
  "ANALYSIS_EVIDENCE_V2_ENABLED",
  "FACE_TRUST_OVERLAY_V2_ENABLED",
  "PROMPT_POLICY_V2_ENABLED",
  "PREVIEW_BOARD_STRATEGY_V2_ENABLED",
  "PREVIEW_QUALITY_GATE_V2_ENABLED",
  "SALON_BRIEF_V2_ENABLED",
  "STYLING_LINK_V2_ENABLED",
  "FASHION_BATCH_V2_ENABLED",
  "CONSULTATION_DISCOVERY_INTERVIEW_ENABLED",
  "CONSULTATION_FASHION_INTERVIEW_ENABLED",
  "CONSULTATION_INTERVIEW_AI_SUMMARY_ENABLED",
  "CONSULTATION_RESULT_AI_NARRATIVE_ENABLED",
  "CONSULTATION_PERSONAL_COLOR_CAPABILITY_ENABLED",
  "CONSULTATION_SALON_BRIEF_CAPABILITY_ENABLED",
  "CONSULTATION_AFTERCARE_CAPABILITY_ENABLED",
  "CONSULTATION_HAIR_PREVIEW_BATCH_ENABLED",
  "CONSULTATION_FASHION_BATCH_ENABLED",
  "PERSONAL_COLOR_V2_WRITE",
  "PERSONAL_COLOR_V2_READ",
  "PERSONAL_COLOR_DRAPE_V1",
  "MAKEUP_DIRECTION_V1",
  "MAKEUP_DENSE_ATLAS_V3",
  "MAKEUP_SEMANTIC_VISION_V3",
  "MAKEUP_SEMANTIC_VISION_STAFF_ONLY",
  "MAKEUP_RECIPE_CATALOG_SHADOW_ENABLED",
  "MAKEUP_RECIPE_CATALOG_ENABLED",
  "CONSULTATION_ZERO_INPUT_INTAKE_ENABLED",
  "FASHION_PRODUCT_TRUTH_ENABLED",
  "ONBOARDING_FASHION_PERSONALIZATION_ENABLED",
  "FASHION_TREND_SIGNALS_V2_ENABLED",
  "FASHION_ADAPTIVE_BATCH_ENABLED",
  "CONSULTATION_AI_LED_HAIR_DECISION_ENABLED",
]);

const CANARY_TRUE_FLAGS = new Set(EXPLICIT_ROLLOUT_FLAGS.filter(
  (name) => !["ENTITLEMENT_V2_LEGACY_BRIDGE_ENABLED", "MAKEUP_RECIPE_CATALOG_ENABLED"].includes(name),
));
const CANARY_FALSE_FLAGS = new Set(["ENTITLEMENT_V2_LEGACY_BRIDGE_ENABLED", "MAKEUP_RECIPE_CATALOG_ENABLED"]);

function isPlaceholder(value) {
  return !value || /^(?:your_|change_me|example|<)/i.test(value.trim());
}

export function parseEnvText(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function evaluateLiveReadiness({ env, mode, linked, migrationMirror }) {
  const failures = [];
  const missingKeys = REQUIRED_LIVE_KEYS.filter((key) => isPlaceholder(env[key]));
  const invalidFlags = EXPLICIT_ROLLOUT_FLAGS.filter((key) => env[key] !== "true" && env[key] !== "false");

  if (missingKeys.length) failures.push(`missing configured keys: ${missingKeys.join(", ")}`);
  if (invalidFlags.length) failures.push(`flags must be explicit true/false: ${invalidFlags.join(", ")}`);
  if (!linked) failures.push("Supabase project link marker is missing");
  if (!migrationMirror.ok) failures.push(`migration mirrors differ: root=${migrationMirror.rootCount}, app=${migrationMirror.appCount}`);

  if (mode === "off") {
    for (const key of ["NEXT_PUBLIC_CONSULTATION_FRONTEND_V2", "CONSULTATION_SESSION_V2_ENABLED"]) {
      if (env[key] !== "false") failures.push(`${key} must be false for the OFF smoke`);
    }
  } else if (mode === "canary") {
    const disabled = [...CANARY_TRUE_FLAGS].filter((key) => env[key] !== "true");
    if (disabled.length) failures.push(`canary-required flags are not true: ${disabled.join(", ")}`);
    const unexpectedlyEnabled = [...CANARY_FALSE_FLAGS].filter((key) => env[key] !== "false");
    if (unexpectedlyEnabled.length) failures.push(`canary-required flags are not false: ${unexpectedlyEnabled.join(", ")}`);
  } else if (mode !== "inventory") {
    failures.push(`unsupported mode: ${mode}`);
  }

  return {
    ok: failures.length === 0,
    mode,
    configuredKeyCount: REQUIRED_LIVE_KEYS.length - missingKeys.length,
    requiredKeyCount: REQUIRED_LIVE_KEYS.length,
    explicitFlagCount: EXPLICIT_ROLLOUT_FLAGS.length - invalidFlags.length,
    requiredFlagCount: EXPLICIT_ROLLOUT_FLAGS.length,
    linked,
    migrationMirror,
    failures,
  };
}

function migrationMirrorState() {
  const rootDirectory = resolve(repositoryRoot, "supabase", "migrations");
  const appDirectory = resolve(appRoot, "supabase", "migrations");
  const rootFiles = readdirSync(rootDirectory).filter((name) => name.endsWith(".sql")).sort();
  const appFiles = readdirSync(appDirectory).filter((name) => name.endsWith(".sql")).sort();
  const normalizedMigration = (directory, name) => readFileSync(resolve(directory, name), "utf8")
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n?/gu, "\n")
    .trimEnd();
  const digest = (directory, names) => createHash("sha256")
    .update(names.map((name) => `${name}:${createHash("sha256").update(normalizedMigration(directory, name)).digest("hex")}`).join("\n"))
    .digest("hex");
  return {
    ok: rootFiles.length === appFiles.length && digest(rootDirectory, rootFiles) === digest(appDirectory, appFiles),
    rootCount: rootFiles.length,
    appCount: appFiles.length,
  };
}

export function formatReadiness(result) {
  const lines = [
    `HairFit V2 live readiness: ${result.ok ? "READY" : "NOT READY"}`,
    `mode: ${result.mode}`,
    `configured keys: ${result.configuredKeyCount}/${result.requiredKeyCount}`,
    `explicit rollout flags: ${result.explicitFlagCount}/${result.requiredFlagCount}`,
    `Supabase project linked: ${result.linked ? "yes" : "no"}`,
    `migration mirror: ${result.migrationMirror.ok ? "match" : "mismatch"} (${result.migrationMirror.rootCount}/${result.migrationMirror.appCount})`,
  ];
  if (result.failures.length) lines.push("failures:", ...result.failures.map((failure) => `- ${failure}`));
  return lines.join("\n");
}

function argumentValue(prefix, fallback) {
  const argument = process.argv.slice(2).find((value) => value.startsWith(`${prefix}=`));
  return argument ? argument.slice(prefix.length + 1) : fallback;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const envPath = resolve(process.cwd(), argumentValue("--env", ".env.local"));
  const mode = argumentValue("--mode", "inventory");
  if (!existsSync(envPath)) {
    console.error(`HairFit V2 live readiness: NOT READY\nfailures:\n- environment file is missing: ${envPath}`);
    process.exitCode = 1;
  } else {
    const result = evaluateLiveReadiness({
      env: parseEnvText(readFileSync(envPath, "utf8")),
      mode,
      linked: existsSync(resolve(appRoot, "supabase", ".temp", "project-ref")),
      migrationMirror: migrationMirrorState(),
    });
    console.log(formatReadiness(result));
    if (!result.ok) process.exitCode = 1;
  }
}
