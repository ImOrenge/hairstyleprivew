import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function readRepo(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const blueprintAudit = spawnSync(process.execPath, [fileURLToPath(new URL("./audit-hairstyle-catalog-blueprints.mjs", import.meta.url))], {
  encoding: "utf8",
});
const lineupAudit = spawnSync(process.execPath, [fileURLToPath(new URL("./audit-hairstyle-catalog-lineups.mjs", import.meta.url))], {
  encoding: "utf8",
});

if (blueprintAudit.status !== 0) {
  throw new Error(blueprintAudit.stderr || blueprintAudit.stdout || "blueprint audit failed");
}

if (lineupAudit.status !== 0) {
  throw new Error(lineupAudit.stderr || lineupAudit.stdout || "lineup audit failed");
}

const catalog = read("lib/hairstyle-catalog.ts");
const trendResearch = read("lib/hairstyle-trend-research.ts");
const rebuildRoute = read("app/api/admin/hairstyles/rebuild/route.ts");
const rotationMigration = read("supabase/migrations/20260703092000_hairstyle_catalog_rotation.sql");
const eventMigration = read("supabase/migrations/20260703094000_hairstyle_catalog_rotation_event_rpc.sql");
const cronMigration = read("supabase/migrations/20260703093000_hairstyle_catalog_rotation_cron.sql");
const packageJson = read("package.json");
const architectureDoc = readRepo("docs/hairstyle-catalog-rotation-architecture.md");
const phaseReadme = readRepo("docs/hairstyle-catalog-rotation/README.md");
const runtimeRunbook = readRepo("docs/hairstyle-catalog-rotation/runtime-smoke-runbook.md");
const rootPackageJson = readRepo("package.json");
const remoteReadinessScript = read("scripts/check-hairstyle-catalog-remote-readiness.mjs");
const runtimeEnvScript = read("scripts/check-hairstyle-catalog-runtime-env.mjs");
const runtimeSmokeScript = read("scripts/smoke-hairstyle-catalog-runtime.mjs");

assert(trendResearch.includes("PRIMARY_RESEARCH_LOOKBACK_DAYS = 60"), "missing 60 day primary lookback");
assert(trendResearch.includes("FALLBACK_RESEARCH_LOOKBACK_DAYS = 120"), "missing 120 day fallback lookback");
assert(!trendResearch.includes("RESEARCH_LOOKBACK_DAYS = 240"), "hair trend research still uses 240 day lookback");
assert(catalog.includes("export async function ensureCatalogAvailable()"), "missing active catalog availability function");
const ensureBody = catalog.match(/export async function ensureCatalogAvailable\(\)[\s\S]*?function filterRowsForStyleTarget/);
assert(ensureBody && !ensureBody[0].includes("rebuildWeeklyHairstyleCatalog("), "user recommendation path still triggers rebuild");
assert(catalog.includes("validateActiveCatalogSnapshot"), "not-due skip must validate the active catalog snapshot");
const notDueBody = catalog.match(/if \(options\.onlyIfDue[\s\S]*?await recordCatalogRotationAttempt\(supabase, "started", null\);/);
assert(notDueBody && notDueBody[0].includes("validateActiveCatalogSnapshot"), "not-due skip returns empty validation instead of active snapshot validation");
assert(catalog.includes("CatalogRebuildConflictError"), "missing rebuild conflict error type");
assert(rebuildRoute.includes("CatalogRebuildConflictError") && rebuildRoute.includes("409"), "rebuild route must map running conflicts to 409");
assert(catalog.includes("enqueueCatalogRotationTrendAlert"), "missing trend alert enqueue service hook");
assert(catalog.includes("trend_alert_enqueue_failed"), "missing alert enqueue failure isolation warning");
const alertPolicyBody = catalog.match(/function shouldSendCatalogRotationAlert\([\s\S]*?function computeCycleExpiresAt/);
assert(alertPolicyBody && alertPolicyBody[0].includes('options.reason === "rotation-check"') && alertPolicyBody[0].includes("lowFreshness && (isAutomaticRotationCheck || options.notify !== true)"), "automatic rotation-check must not send low freshness catalog alerts");
assert(catalog.includes("buildCatalogLineupsForCycle"), "missing catalog lineup builder");
assert(catalog.includes('from "./hairstyle-catalog-lineup"'), "lineup builder must live in the pure lineup module");
assert(catalog.includes("buildLineupBackedRecommendations"), "missing lineup-backed recommendation builder");
const topNineBody = catalog.match(/function buildTopNine\([\s\S]*?function buildLineupBackedRecommendations/);
assert(topNineBody && topNineBody[0].includes("if (limit <= 0)") && topNineBody[0].includes("selected.length >= limit"), "lineup fallback builder must enforce recommendation limit");
assert(catalog.includes("computeLineupOverlap"), "missing lineup overlap calculation");
assert(catalog.includes("overlap_warning"), "missing lineup overlap warning event");
const generateBody = catalog.match(/export async function generateCatalogBackedRecommendationSet\([\s\S]*?return \{[\s\S]*?selectionContext,[\s\S]*?\};\n\}/);
assert(generateBody && generateBody[0].includes("lineups") && generateBody[0].includes("buildLineupBackedRecommendations"), "recommendation path must use active lineup snapshots");
assert(!catalog.includes("retrying with seeded fallback"), "auto rebuild still falls back to seeded catalog");
assert(!catalog.includes('rebuildCatalogWithMode(options, "seeded-weekly", staleRunningCyclesFailed, activeBefore)'), "auto rebuild must not auto-activate seeded fallback");
assert(rotationMigration.includes("idx_trend_alerts_catalog_cycle_alert_type"), "missing trend alert idempotency index");
assert(rotationMigration.includes("hairstyle_catalog_active_cycles"), "missing active catalog table migration");
assert(rotationMigration.includes("v_male_lineup_count") && rotationMigration.includes("insufficient lineups"), "activation RPC must reject cycles without male/female lineups");
assert(eventMigration.includes("record_hairstyle_catalog_rotation_event"), "missing generic rotation event RPC");
assert(cronMigration.includes("cron-hairstyle-catalog-rotation-check"), "missing rotation cron job name");
assert(cronMigration.includes("cron-trend-emails-post-rotation"), "missing post rotation mail cron job name");
assert(cronMigration.includes("'onlyIfDue', true"), "rotation cron does not send onlyIfDue");
assert(cronMigration.includes("'x-admin-secret'"), "rotation cron does not send admin secret header");
assert(architectureDoc.includes("상태: 구현 완료, Supabase runtime smoke 대기"), "architecture doc status is stale");
assert(!architectureDoc.includes("상태: 설계안, 미구현"), "architecture doc still says unimplemented");
assert(phaseReadme.includes("runtime-smoke-runbook.md"), "phase README must link runtime smoke runbook");
assert(phaseReadme.includes("상태: 구현 완료, Supabase runtime smoke 대기"), "phase README status is stale");
assert(!phaseReadme.includes("상태: 구현 태스크 분해, 미구현"), "phase README still says unimplemented");
assert(!phaseReadme.includes("현재 worktree는 Supabase project ref가 없어"), "phase README still says Supabase project ref is missing");
assert(runtimeRunbook.includes("cron-hairstyle-catalog-rotation-check"), "runtime smoke runbook missing rotation cron check");
assert(runtimeRunbook.includes("catalog_rotation"), "runtime smoke runbook missing catalog rotation alert check");
assert(runtimeRunbook.includes("hairstyle:catalog:env:check"), "runtime smoke runbook missing runtime env preflight");
assert(runtimeRunbook.includes("Supabase linked dry-run 완료"), "runtime smoke runbook must record linked dry-run status");
assert(!runtimeRunbook.includes("현재 격리 worktree에는 project ref가 없음"), "runtime smoke runbook still says project ref is missing");
assert(packageJson.includes("\"hairstyle:catalog:remote:check\""), "my-app package is missing hairstyle remote readiness script");
assert(packageJson.includes("\"hairstyle:catalog:lineup:audit\""), "my-app package is missing hairstyle lineup audit script");
assert(packageJson.includes("\"hairstyle:catalog:env:check\""), "my-app package is missing hairstyle runtime env check script");
assert(packageJson.includes("\"hairstyle:catalog:runtime:smoke\""), "my-app package is missing hairstyle runtime smoke script");
assert(rootPackageJson.includes("\"hairstyle:catalog:remote:check\""), "root package is missing hairstyle remote readiness script");
assert(rootPackageJson.includes("\"hairstyle:catalog:lineup:audit\""), "root package is missing hairstyle lineup audit script");
assert(rootPackageJson.includes("\"hairstyle:catalog:env:check\""), "root package is missing hairstyle runtime env check script");
assert(rootPackageJson.includes("\"hairstyle:catalog:runtime:smoke\""), "root package is missing hairstyle runtime smoke script");
assert(remoteReadinessScript.includes("blockingPending") && remoteReadinessScript.includes("Refusing hairstyle remote write"), "remote readiness guard must block unrelated pending migrations");
assert(remoteReadinessScript.includes("HAIRSTYLE_CATALOG_MIGRATION_CONFIRM_PROJECT_REF"), "remote readiness guard must require explicit project confirmation for writes");
assert(remoteReadinessScript.includes("HAIRSTYLE_CATALOG_REMOTE_CHECK_TIMEOUT_MS"), "remote readiness guard must expose a command timeout override");
assert(remoteReadinessScript.includes("timed out after"), "remote readiness guard must fail clearly on command timeout");
assert(remoteReadinessScript.includes("withRemoteCheckLock"), "remote readiness guard must prevent concurrent Supabase dry-runs");
assert(remoteReadinessScript.includes("hairstyle-catalog-remote-check.lock"), "remote readiness guard must use a named local lock file");
assert(runtimeEnvScript.includes("mode=admin-api"), "runtime env check must expose admin-api mode");
assert(runtimeEnvScript.includes("mode=cron-registration"), "runtime env check must expose cron-registration mode");
assert(runtimeEnvScript.includes("mode=trend-mail-function"), "runtime env check must expose trend-mail-function mode");
assert(runtimeEnvScript.includes("INTERNAL_API_SECRET"), "runtime env check must require admin secret");
assert(runtimeEnvScript.includes("SUPABASE_SERVICE_ROLE_KEY"), "runtime env check must require Supabase service role key");
assert(runtimeEnvScript.includes("RESEND_API_KEY"), "runtime env check must require Resend API key for trend mail smoke");
assert(runtimeEnvScript.includes("RESEND_FROM_EMAIL"), "runtime env check must require a Resend sender for trend mail smoke");
assert(runtimeEnvScript.includes("@resend\\.dev"), "runtime env check must reject Resend development senders");
assert(runtimeEnvScript.includes("deriveEdgeFunctionBaseUrl"), "runtime env check must derive Supabase Edge Function base URL");
assert(runtimeSmokeScript.includes("mode=status"), "runtime smoke runner must expose status mode");
assert(runtimeSmokeScript.includes("mode=dry-run"), "runtime smoke runner must expose dry-run mode");
assert(runtimeSmokeScript.includes("mode=rotation-check"), "runtime smoke runner must expose rotation-check mode");
assert(runtimeSmokeScript.includes("mode=force-rebuild"), "runtime smoke runner must expose force-rebuild mode");
assert(runtimeSmokeScript.includes("mode=alert-idempotency"), "runtime smoke runner must expose alert idempotency mode");
assert(runtimeSmokeScript.includes("requireWriteConfirmation"), "runtime smoke runner must guard mutating calls");
assert(runtimeSmokeScript.includes("HAIRSTYLE_CATALOG_RUNTIME_SMOKE_CONFIRM_APP_URL"), "runtime smoke runner must support target confirmation env");
assert(runtimeSmokeScript.includes("beforeActiveCycleId === afterActiveCycleId"), "runtime smoke dry-run must verify active cycle is unchanged");
assert(runtimeSmokeScript.includes("SUPABASE_SERVICE_ROLE_KEY"), "runtime smoke alert query must use service role env");
assert(runtimeSmokeScript.includes("rows.length <= 1"), "runtime smoke must verify catalog_rotation alert idempotency");

console.log(JSON.stringify({
  ok: true,
  checks: [
    "blueprints",
    "lookback",
    "active-only recommendation path",
    "not-due active snapshot validation",
    "running conflict status",
    "trend alert idempotency",
    "low freshness alert policy",
    "activation lineup guard",
    "lineup builder",
    "lineup deterministic rotation",
    "lineup-backed recommendations",
    "lineup fallback limit",
    "overlap warning",
    "no automatic seeded fallback",
    "cron names",
    "doc status",
    "remote readiness guard",
    "runtime env preflight",
    "runtime API smoke runner",
  ],
}, null, 2));
