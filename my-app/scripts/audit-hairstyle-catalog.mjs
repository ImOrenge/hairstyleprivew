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

function sectionBetween(doc, heading) {
  const marker = `## ${heading}`;
  const start = doc.indexOf(marker);
  assert(start >= 0, `missing phase doc section: ${heading}`);
  const next = doc.indexOf("\n## ", start + marker.length);
  return next >= 0 ? doc.slice(start, next) : doc.slice(start);
}

function checklistRows(section) {
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\| \[[ x]\] \|/.test(line));
}

function assertPhaseDoc(spec, doc, readme) {
  assert(doc.includes(spec.title), `${spec.file} title is missing or stale`);
  assert(readme.includes(`[${spec.fileName}](${spec.fileName})`), `${spec.file} is not linked from phase README`);
  for (const section of ["목표", "변경 범위", "작업 체크리스트", "완료 기준", "검증 체크리스트"]) {
    assert(doc.includes(`## ${section}`), `${spec.file} missing section: ${section}`);
  }

  const workRows = checklistRows(sectionBetween(doc, "작업 체크리스트"));
  const verificationRows = checklistRows(sectionBetween(doc, "검증 체크리스트"));
  assert(workRows.length > 0, `${spec.file} has no work checklist rows`);
  assert(verificationRows.length > 0, `${spec.file} has no verification checklist rows`);

  const incompleteWorkRows = workRows.filter((line) => line.startsWith("| [ ] |"));
  assert(incompleteWorkRows.length === 0, `${spec.file} has incomplete implementation tasks: ${incompleteWorkRows.join(" / ")}`);

  const incompleteVerificationRows = verificationRows.filter((line) => line.startsWith("| [ ] |"));
  for (const row of incompleteVerificationRows) {
    assert(
      row.includes("Supabase runtime env 필요") || row.includes("Supabase pg_cron runtime 필요"),
      `${spec.file} has unchecked verification not marked as runtime-gated: ${row}`,
    );
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
const middleware = read("middleware.ts");
const rotationMigration = read("supabase/migrations/20260703092000_hairstyle_catalog_rotation.sql");
const eventMigration = read("supabase/migrations/20260703094000_hairstyle_catalog_rotation_event_rpc.sql");
const cronMigration = read("supabase/migrations/20260703093000_hairstyle_catalog_rotation_cron.sql");
const cronStatusMigration = read("supabase/migrations/20260703124648_hairstyle_catalog_cron_status.sql");
const pgCronExtensionMigration = read("supabase/migrations/20260704043000_enable_pg_cron_extension.sql");
const cronServiceRoleAuthMigration = read("supabase/migrations/20260704044500_hairstyle_catalog_cron_service_role_auth.sql");
const cronSecurityDefinerMigration = read("supabase/migrations/20260704050000_hairstyle_catalog_cron_register_security_definer.sql");
const supabaseConfig = read("supabase/config.toml");
const packageJson = read("package.json");
const architectureDoc = readRepo("docs/hairstyle-catalog-rotation-architecture.md");
const phaseReadme = readRepo("docs/hairstyle-catalog-rotation/README.md");
const runtimeRunbook = readRepo("docs/hairstyle-catalog-rotation/runtime-smoke-runbook.md");
const phaseDocSpecs = [
  ["P1. DB 기반", "phase-01-db-foundation.md"],
  ["P2. 서비스 리팩터", "phase-02-service-active-catalog.md"],
  ["P3. 리빌드 API", "phase-03-rebuild-api.md"],
  ["P4. 트렌드 알림 Enqueue", "phase-04-trend-alert-enqueue.md"],
  ["P5. 자동 Rotation Cron", "phase-05-auto-rotation-cron.md"],
  ["P6. 회전 품질", "phase-06-rotation-quality.md"],
  ["P7. 운영 검증", "phase-07-validation-ops.md"],
].map(([title, fileName]) => ({
  title: `# ${title}`,
  fileName,
  file: `docs/hairstyle-catalog-rotation/${fileName}`,
  doc: readRepo(`docs/hairstyle-catalog-rotation/${fileName}`),
}));
const rootPackageJson = readRepo("package.json");
const remoteReadinessScript = read("scripts/check-hairstyle-catalog-remote-readiness.mjs");
const runtimeEnvScript = read("scripts/check-hairstyle-catalog-runtime-env.mjs");
const runtimeSmokeScript = read("scripts/smoke-hairstyle-catalog-runtime.mjs");
const cloudflareSecretsScript = read("scripts/check-hairstyle-catalog-cloudflare-secrets.mjs");
const trendMailDeployScript = read("scripts/deploy-hairstyle-catalog-trend-mail-function.mjs");
const launchReadinessScript = read("scripts/check-hairstyle-catalog-launch-readiness.mjs");
const launchSummaryScript = read("scripts/check-hairstyle-catalog-launch-summary.mjs");
const trendMailFunction = read("supabase/functions/cron-trend-emails/index.ts");

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
assert(catalog.includes("lineupCounts: validation.lineupCounts"), "rebuild response must expose top-level lineupCounts");
assert(catalog.includes("getServiceRoleAdminSecret"), "catalog admin auth must support service-role fallback");
assert(catalog.includes('request.headers.get("apikey")'), "catalog admin auth must accept apikey service-role header");
assert(catalog.includes('request.headers.get("authorization")'), "catalog admin auth must accept Authorization bearer service-role header");
const catalogSecretBypassCount = (
  middleware.match(/isCatalogSecretAdminApiRoute\(req\) && hasValidCatalogAdminSecret\(req\)/g) || []
).length;
const firstCatalogSecretBypass = middleware.indexOf("if (isCatalogSecretAdminApiRoute(req) && hasValidCatalogAdminSecret(req))");
const firstAuthRead = middleware.indexOf("const authObject =");
assert(middleware.includes("function hasValidCatalogAdminSecret"), "middleware must validate catalog admin secret requests");
assert(middleware.includes("SUPABASE_SERVICE_ROLE_KEY"), "middleware catalog admin bypass must support service-role fallback");
assert(catalogSecretBypassCount >= 2, "middleware must allow catalog secret admin APIs in both Clerk and no-Clerk paths");
assert(
  firstCatalogSecretBypass >= 0 && firstAuthRead >= 0 && firstCatalogSecretBypass < firstAuthRead,
  "catalog secret admin APIs must bypass Clerk auth before reading user auth",
);
assert(catalog.includes("enqueueCatalogRotationTrendAlert"), "missing trend alert enqueue service hook");
assert(catalog.includes("trend_alert_enqueue_failed"), "missing alert enqueue failure isolation warning");
const alertPolicyBody = catalog.match(/function shouldSendCatalogRotationAlert\([\s\S]*?function computeCycleExpiresAt/);
assert(alertPolicyBody && alertPolicyBody[0].includes('options.reason === "rotation-check"') && alertPolicyBody[0].includes("lowFreshness && (isAutomaticRotationCheck || options.notify !== true)"), "automatic rotation-check must not send low freshness catalog alerts");
assert(catalog.includes("buildCatalogLineupsForCycle"), "missing catalog lineup builder");
assert(catalog.includes('from "./hairstyle-catalog-lineup"'), "lineup builder must live in the pure lineup module");
assert(catalog.includes("attachDryRunCatalogRowIds"), "dry-run rebuild must attach stable temporary ids for lineup validation");
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
assert(cronMigration.includes("'apikey'"), "post-rotation mail cron must send Supabase apikey header");
assert(pgCronExtensionMigration.includes("create extension if not exists pg_cron"), "missing pg_cron extension migration");
assert(cronServiceRoleAuthMigration.includes("'apikey', p_service_role_key"), "rotation cron must send service-role apikey to admin route");
assert(cronServiceRoleAuthMigration.includes("'Authorization', 'Bearer ' || p_service_role_key"), "rotation cron must send service-role bearer token to admin route");
assert(cronServiceRoleAuthMigration.includes("p_admin_secret") && !cronServiceRoleAuthMigration.includes("p_admin_secret is required"), "rotation cron admin secret must be optional");
assert(cronSecurityDefinerMigration.includes("security definer"), "rotation cron registration helper must run as security definer");
assert(cronStatusMigration.includes("get_hairstyle_catalog_rotation_cron_status"), "missing hairstyle cron status RPC");
assert(cronStatusMigration.includes("to_regclass('cron.job')"), "cron status RPC must tolerate missing pg_cron");
assert(cronStatusMigration.includes("20 0 * * *"), "cron status RPC must validate rotation check schedule");
assert(cronStatusMigration.includes("40 0 * * *"), "cron status RPC must validate post-rotation mail schedule");
assert(cronStatusMigration.includes("grant execute on function public.get_hairstyle_catalog_rotation_cron_status() to service_role"), "cron status RPC must be service-role only");
assert(architectureDoc.includes("상태: 구현 완료, Supabase runtime smoke 대기"), "architecture doc status is stale");
assert(!architectureDoc.includes("상태: 설계안, 미구현"), "architecture doc still says unimplemented");
assert(!architectureDoc.includes("현재 구현의 `RESEARCH_LOOKBACK_DAYS = 240`"), "architecture doc still presents the old 240-day lookback as current");
assert(!architectureDoc.includes("현재 18개 blueprint"), "architecture doc still presents the old 18-blueprint pool as current");
assert(phaseReadme.includes("runtime-smoke-runbook.md"), "phase README must link runtime smoke runbook");
assert(phaseReadme.includes("상태: 구현 완료, Supabase runtime smoke 대기"), "phase README status is stale");
assert(!phaseReadme.includes("상태: 구현 태스크 분해, 미구현"), "phase README still says unimplemented");
assert(!phaseReadme.includes("현재 worktree는 Supabase project ref가 없어"), "phase README still says Supabase project ref is missing");
assert(runtimeRunbook.includes("cron-hairstyle-catalog-rotation-check"), "runtime smoke runbook missing rotation cron check");
assert(runtimeRunbook.includes("catalog_rotation"), "runtime smoke runbook missing catalog rotation alert check");
assert(runtimeRunbook.includes("hairstyle:catalog:env:check"), "runtime smoke runbook missing runtime env preflight");
assert(runtimeRunbook.includes("Supabase linked dry-run 완료"), "runtime smoke runbook must record linked dry-run status");
assert(runtimeRunbook.includes("--summaryJson"), "runtime smoke runbook missing readiness summary JSON option");
assert(!runtimeRunbook.includes("현재 격리 worktree에는 project ref가 없음"), "runtime smoke runbook still says project ref is missing");
for (const phaseDoc of phaseDocSpecs) {
  assertPhaseDoc(phaseDoc, phaseDoc.doc, phaseReadme);
}
assert(packageJson.includes("\"hairstyle:catalog:remote:check\""), "my-app package is missing hairstyle remote readiness script");
assert(packageJson.includes("\"hairstyle:catalog:lineup:audit\""), "my-app package is missing hairstyle lineup audit script");
assert(packageJson.includes("\"hairstyle:catalog:env:check\""), "my-app package is missing hairstyle runtime env check script");
assert(packageJson.includes("\"hairstyle:catalog:runtime:smoke\""), "my-app package is missing hairstyle runtime smoke script");
assert(packageJson.includes("\"hairstyle:catalog:cloudflare:secrets\""), "my-app package is missing hairstyle Cloudflare secret check script");
assert(packageJson.includes("\"hairstyle:catalog:trend-mail:deploy\""), "my-app package is missing hairstyle trend mail deploy script");
assert(packageJson.includes("\"hairstyle:catalog:launch:check\""), "my-app package is missing hairstyle launch readiness script");
assert(packageJson.includes("\"hairstyle:catalog:launch:summary:check\""), "my-app package is missing hairstyle launch summary check script");
assert(rootPackageJson.includes("\"hairstyle:catalog:remote:check\""), "root package is missing hairstyle remote readiness script");
assert(rootPackageJson.includes("\"hairstyle:catalog:lineup:audit\""), "root package is missing hairstyle lineup audit script");
assert(rootPackageJson.includes("\"hairstyle:catalog:env:check\""), "root package is missing hairstyle runtime env check script");
assert(rootPackageJson.includes("\"hairstyle:catalog:runtime:smoke\""), "root package is missing hairstyle runtime smoke script");
assert(rootPackageJson.includes("\"hairstyle:catalog:cloudflare:secrets\""), "root package is missing hairstyle Cloudflare secret check script");
assert(rootPackageJson.includes("\"hairstyle:catalog:trend-mail:deploy\""), "root package is missing hairstyle trend mail deploy script");
assert(rootPackageJson.includes("\"hairstyle:catalog:launch:check\""), "root package is missing hairstyle launch readiness script");
assert(rootPackageJson.includes("\"hairstyle:catalog:launch:summary:check\""), "root package is missing hairstyle launch summary check script");
assert(architectureDoc.includes("check-hairstyle-catalog-launch-summary.mjs"), "architecture doc missing launch summary check script impact");
assert(architectureDoc.includes("Launch summary schema guard"), "architecture deployment checklist missing launch summary schema guard");
assert(cloudflareSecretsScript.includes("INTERNAL_API_SECRET"), "Cloudflare secret check must verify admin API secret name");
assert(cloudflareSecretsScript.includes("OPTIONAL_DEPLOYED_NAMES") && cloudflareSecretsScript.includes("SUPABASE_SERVICE_ROLE_KEY"), "Cloudflare secret check must allow service-role admin fallback");
assert(cloudflareSecretsScript.includes("wrangler\", \"secret\", \"list\""), "Cloudflare secret check must list deployed Worker secret names");
assert(cloudflareSecretsScript.includes("--format\", \"json\""), "Cloudflare secret check must parse Wrangler JSON output");
assert(cloudflareSecretsScript.includes("Cloudflare API authentication failed"), "Cloudflare secret check must explain invalid API token failures");
assert(!cloudflareSecretsScript.includes("secret put"), "Cloudflare secret check must not write deployed secret values");
assert(remoteReadinessScript.includes("blockingPending") && remoteReadinessScript.includes("Refusing hairstyle remote write"), "remote readiness guard must block unrelated pending migrations");
assert(remoteReadinessScript.includes("blockingMigrationDetails"), "remote readiness guard must describe unrelated pending migrations");
assert(remoteReadinessScript.includes("readBlockingMigrationDetail"), "remote readiness guard must summarize blocking migration files");
assert(remoteReadinessScript.includes("HAIRSTYLE_CATALOG_MIGRATION_CONFIRM_PROJECT_REF"), "remote readiness guard must require explicit project confirmation for writes");
assert(remoteReadinessScript.includes("HAIRSTYLE_CATALOG_REMOTE_CHECK_TIMEOUT_MS"), "remote readiness guard must expose a command timeout override");
assert(remoteReadinessScript.includes("timed out after"), "remote readiness guard must fail clearly on command timeout");
assert(remoteReadinessScript.includes("withRemoteCheckLock"), "remote readiness guard must prevent concurrent Supabase dry-runs");
assert(remoteReadinessScript.includes("hairstyle-catalog-remote-check.lock"), "remote readiness guard must use a named local lock file");
assert(remoteReadinessScript.includes("hairstylePending.length === pendingMigrations.length"), "remote readiness guard must allow expected follow-up migrations");
assert(remoteReadinessScript.includes("20260703124648_hairstyle_catalog_cron_status.sql"), "remote readiness guard must expect cron status migration");
assert(remoteReadinessScript.includes("20260704043000_enable_pg_cron_extension.sql"), "remote readiness guard must expect pg_cron extension migration");
assert(remoteReadinessScript.includes("20260704044500_hairstyle_catalog_cron_service_role_auth.sql"), "remote readiness guard must expect service-role cron auth migration");
assert(remoteReadinessScript.includes("20260704050000_hairstyle_catalog_cron_register_security_definer.sql"), "remote readiness guard must expect cron security definer migration");
assert(runtimeEnvScript.includes("mode=admin-api"), "runtime env check must expose admin-api mode");
assert(runtimeEnvScript.includes("mode=cron-registration"), "runtime env check must expose cron-registration mode");
assert(runtimeEnvScript.includes("mode=trend-mail-function"), "runtime env check must expose trend-mail-function mode");
assert(runtimeEnvScript.includes("INTERNAL_API_SECRET"), "runtime env check must require admin secret");
assert(runtimeEnvScript.includes("admin API service-role fallback"), "runtime env check must accept service-role admin fallback");
assert(runtimeEnvScript.includes("SUPABASE_SERVICE_ROLE_KEY"), "runtime env check must require Supabase service role key");
assert(runtimeEnvScript.includes("RESEND_API_KEY"), "runtime env check must require Resend API key for trend mail smoke");
assert(runtimeEnvScript.includes("RESEND_FROM_EMAIL"), "runtime env check must require a Resend sender for trend mail smoke");
assert(runtimeEnvScript.includes("@resend\\.dev"), "runtime env check must reject Resend development senders");
assert(runtimeEnvScript.includes(".env.assets"), "runtime env check must load asset/runtime env file copied from the main worktree");
assert(runtimeEnvScript.includes("readLinkedProjectRef"), "runtime env check must derive Supabase URL from linked project ref");
assert(runtimeEnvScript.includes("deriveEdgeFunctionBaseUrl"), "runtime env check must derive Supabase Edge Function base URL");
assert(runtimeSmokeScript.includes("mode=status"), "runtime smoke runner must expose status mode");
assert(runtimeSmokeScript.includes("mode=dry-run"), "runtime smoke runner must expose dry-run mode");
assert(runtimeSmokeScript.includes("mode=rotation-check"), "runtime smoke runner must expose rotation-check mode");
assert(runtimeSmokeScript.includes("mode=force-rebuild"), "runtime smoke runner must expose force-rebuild mode");
assert(runtimeSmokeScript.includes("mode=cron-db"), "runtime smoke runner must expose cron DB mode");
assert(runtimeSmokeScript.includes("mode=active-db"), "runtime smoke runner must expose active DB mode");
assert(runtimeSmokeScript.includes("mode=alert-idempotency"), "runtime smoke runner must expose alert idempotency mode");
assert(runtimeSmokeScript.includes("mode=trend-mail-function"), "runtime smoke runner must expose trend mail function mode");
assert(runtimeSmokeScript.includes("requireWriteConfirmation"), "runtime smoke runner must guard mutating calls");
assert(runtimeSmokeScript.includes("adminAuthHeaders"), "runtime smoke runner must support service-role admin fallback");
assert(runtimeSmokeScript.includes("HAIRSTYLE_CATALOG_RUNTIME_SMOKE_CONFIRM_APP_URL"), "runtime smoke runner must support target confirmation env");
assert(runtimeSmokeScript.includes("beforeActiveCycleId === afterActiveCycleId"), "runtime smoke dry-run must verify active cycle is unchanged");
assert(runtimeSmokeScript.includes("SUPABASE_SERVICE_ROLE_KEY"), "runtime smoke alert query must use service role env");
assert(runtimeSmokeScript.includes(".env.assets"), "runtime smoke runner must load asset/runtime env file copied from the main worktree");
assert(runtimeSmokeScript.includes("readLinkedProjectRef"), "runtime smoke runner must derive Supabase URL from linked project ref");
assert(runtimeSmokeScript.includes("PGRST202"), "runtime smoke runner must explain missing RPC migration/schema-cache failures");
assert(runtimeSmokeScript.includes("42703"), "runtime smoke runner must explain missing trend alert catalog columns");
assert(runtimeSmokeScript.includes("rows.length <= 1"), "runtime smoke must verify catalog_rotation alert idempotency");
assert(runtimeSmokeScript.includes("cron-trend-emails"), "runtime smoke runner must target the trend mail Edge Function");
assert(runtimeSmokeScript.includes("allowPendingAlerts"), "runtime trend mail smoke must guard live email sends");
assert(runtimeSmokeScript.includes("dueAlerts.length > 0 && !allowPendingAlerts"), "runtime trend mail smoke must refuse due alerts by default");
assert(runtimeSmokeScript.includes("assertNoDuplicateDeliveries"), "runtime trend mail smoke must check delivery idempotency");
assert(runtimeSmokeScript.includes("validateTrendMailProcessedAlerts"), "runtime trend mail smoke must validate processed alert evidence");
assert(runtimeSmokeScript.includes("catalogRotationProcessed"), "runtime trend mail smoke must verify catalog rotation processing count");
assert(runtimeSmokeScript.includes("alertType === \"catalog_rotation\""), "runtime trend mail smoke must verify catalog_rotation alerts were processed");
assert(runtimeSmokeScript.includes("get_active_hairstyle_catalog"), "runtime active DB smoke must call the active catalog RPC");
assert(runtimeSmokeScript.includes("items.length >= 32"), "runtime active DB smoke must enforce 32 active catalog rows");
assert(runtimeSmokeScript.includes("maleCandidateCount >= 18"), "runtime active DB smoke must enforce male candidate pool size");
assert(runtimeSmokeScript.includes("femaleCandidateCount >= 18"), "runtime active DB smoke must enforce female candidate pool size");
assert(runtimeSmokeScript.includes("validateLineupShape"), "runtime active DB smoke must validate active lineup shape");
assert(runtimeSmokeScript.includes("targetLineups.length === 9"), "runtime active DB smoke must reject over/under-sized lineups");
assert(runtimeSmokeScript.includes("slotCounts.trend === 3"), "runtime active DB smoke must validate trend slot count");
assert(runtimeSmokeScript.includes("slotCounts.face_fit === 3"), "runtime active DB smoke must validate face_fit slot count");
assert(runtimeSmokeScript.includes("slotCounts.evergreen === 2"), "runtime active DB smoke must validate evergreen slot count");
assert(runtimeSmokeScript.includes("slotCounts.experimental === 1"), "runtime active DB smoke must validate experimental slot count");
assert(runtimeSmokeScript.includes("get_hairstyle_catalog_rotation_cron_status"), "runtime cron DB smoke must call the cron status RPC");
assert(trendMailFunction.includes("prioritizePendingAlerts"), "trend mail function must prioritize catalog rotation alerts in the due batch");
assert(trendMailFunction.includes("ALERT_FETCH_LIMIT = 25"), "trend mail function must fetch enough due alerts before catalog priority sorting");
assert(trendMailFunction.includes("alert_type,catalog_cycle_id"), "trend mail function must select catalog alert metadata");
assert(supabaseConfig.includes("[functions.cron-trend-emails]"), "trend mail function must have explicit function config");
assert(supabaseConfig.includes("verify_jwt = false"), "trend mail function must disable platform JWT verification for service-key cron calls");
assert(trendMailFunction.includes("isAuthorizedCronRequest"), "trend mail function must authorize cron requests inside the function");
assert(trendMailFunction.includes("HAIRSTYLE_CATALOG_SUPABASE_SERVICE_ROLE_KEY"), "trend mail function must support function-scoped service role secret");
assert(trendMailFunction.includes("HAIRSTYLE_CATALOG_CRON_SECRET"), "trend mail function must support function-scoped cron secret");
assert(trendMailFunction.includes("allowedSecrets.includes"), "trend mail function must compare cron auth against all configured secrets");
assert(trendMailFunction.includes('request.headers.get("apikey")'), "trend mail function must accept Supabase apikey header");
assert(trendMailFunction.includes('request.headers.get("authorization")'), "trend mail function must inspect Authorization bearer header");
assert(trendMailFunction.includes('error: "Unauthorized"'), "trend mail function must reject missing service credentials");
assert(trendMailFunction.includes("catalogRotationProcessed"), "trend mail function response must expose processed catalog rotation count");
assert(trendMailFunction.includes("processedAlerts"), "trend mail function response must expose processed alert evidence");
assert(trendMailDeployScript.includes("dry-run only"), "trend mail deploy helper must default to dry-run");
assert(trendMailDeployScript.includes("HAIRSTYLE_CATALOG_FUNCTION_DEPLOY_ALLOW_WRITE"), "trend mail deploy helper must require write allow env");
assert(trendMailDeployScript.includes("HAIRSTYLE_CATALOG_FUNCTION_DEPLOY_CONFIRM_PROJECT_REF"), "trend mail deploy helper must require project confirmation");
assert(
  trendMailDeployScript.includes('"functions"') &&
    trendMailDeployScript.includes('"deploy"') &&
    trendMailDeployScript.includes("functionName"),
  "trend mail deploy helper must deploy the Supabase function",
);
assert(trendMailDeployScript.includes("--no-verify-jwt"), "trend mail deploy helper must explicitly disable platform JWT verification");
assert(trendMailDeployScript.includes("--use-api"), "trend mail deploy helper must support server-side function bundling");
assert(trendMailDeployScript.includes('"deno", ["check", "--no-lock", functionPath]'), "trend mail deploy helper must run Deno check before deploy");
assert(trendMailDeployScript.includes("verify_jwt=false"), "trend mail deploy helper must enforce function JWT config");
assert(trendMailDeployScript.includes("isAuthorizedCronRequest"), "trend mail deploy helper must enforce in-function auth guard");
assert(trendMailDeployScript.includes("HAIRSTYLE_CATALOG_SUPABASE_SERVICE_ROLE_KEY"), "trend mail deploy helper must enforce function-scoped service role secret support");
assert(trendMailDeployScript.includes("HAIRSTYLE_CATALOG_CRON_SECRET"), "trend mail deploy helper must enforce function-scoped cron secret support");
assert(launchReadinessScript.includes("hairstyle:catalog:remote:check"), "launch readiness must run remote migration readiness");
assert(launchReadinessScript.includes("hairstyle:catalog:env:check"), "launch readiness must run runtime env preflight");
assert(launchReadinessScript.includes("hairstyle:catalog:cloudflare:secrets"), "launch readiness must check Cloudflare secret names");
assert(launchReadinessScript.includes("hairstyle:catalog:trend-mail:deploy"), "launch readiness must run trend mail deploy dry-run");
assert(launchReadinessScript.includes("allowMissingExternal"), "launch readiness must support external blocker reporting without failure");
assert(launchReadinessScript.includes("runReadOnlyRuntimeSmoke"), "launch readiness must expose read-only runtime smoke execution");
assert(launchReadinessScript.includes("runAdminDryRunSmoke"), "launch readiness must separate admin dry-run POST smoke from read-only smoke");
assert(launchReadinessScript.includes("runAllRuntimeSmoke"), "launch readiness must keep the compatibility runtime smoke flag explicit");
assert(launchReadinessScript.includes("forceRuntimeSmoke"), "launch readiness must expose a force flag for raw runtime smoke failures");
assert(launchReadinessScript.includes("shouldSkipRuntimeSmoke"), "launch readiness must skip dependent runtime smoke when prerequisites fail");
assert(launchReadinessScript.includes("listRemoteRuntimeBlockers"), "launch readiness must derive runtime smoke blockers from remote readiness");
assert(launchReadinessScript.includes("runTrendMailSmoke"), "launch readiness must expose trend mail smoke execution");
assert(launchReadinessScript.includes('"appUrl", "cycleId", "market"'), "launch readiness must pass cycleId and market to runtime smoke");
assert(launchReadinessScript.includes('"allowPendingAlerts", "expectPendingCatalogAlert"'), "launch readiness must pass intentional live trend-mail smoke flags");
assert(launchReadinessScript.includes("pendingMigrations"), "launch readiness must report pending remote migrations");
assert(launchReadinessScript.includes("blockingMigrationDetails"), "launch readiness must include blocking migration summaries");
assert(launchReadinessScript.includes("runtime env preflight failed"), "launch readiness must gate runtime smoke on env preflight");
assert(launchReadinessScript.includes("summaryJson"), "launch readiness must expose machine-readable summary output");
assert(launchReadinessScript.includes("writeSummaryJson"), "launch readiness must write summary JSON when requested");
assert(launchReadinessScript.includes("buildFatalSummary"), "launch readiness must write summary JSON for fatal failures");
assert(launchReadinessScript.includes("fatalError"), "launch readiness fatal summary must include the fatal error message");
assert(launchReadinessScript.includes("hairstyle-catalog-launch-readiness"), "launch readiness summary must identify the check");
assert(launchReadinessScript.includes("schemaVersion"), "launch readiness summary must expose a schema version");
assert(launchReadinessScript.includes("generatedAt"), "launch readiness summary must include generation timestamp");
assert(launchReadinessScript.includes("requestedEvidence"), "launch readiness summary must report requested evidence");
assert(launchReadinessScript.includes("summarizeBlockingMigrationDetails"), "launch readiness summary must preserve blocking migration details");
assert(launchReadinessScript.includes("missingEvidence"), "launch readiness summary must include missing evidence");
assert(launchReadinessScript.includes("externalBlockers"), "launch readiness summary must include external blockers");
assert(launchReadinessScript.includes("completed with missing external evidence"), "launch readiness allow-missing path must finish after blocker output");
assert(launchReadinessScript.includes("process.exitCode = 2"), "launch readiness must fail when external evidence is missing by default");
assert(launchSummaryScript.includes("hairstyle-catalog-launch-readiness"), "launch summary check must validate readiness summary identity");
assert(launchSummaryScript.includes("schemaVersion === 1"), "launch summary check must validate schema version");
assert(launchSummaryScript.includes("requestedEvidence"), "launch summary check must validate requested evidence flags");
assert(launchSummaryScript.includes("blockingMigrationDetails"), "launch summary check must validate blocking migration details");
assert(launchSummaryScript.includes("fatalError"), "launch summary check must validate fatal summaries");
assert(launchSummaryScript.includes("expectRemoteBlocker"), "launch summary check must support remote blocker expectations");
assert(launchSummaryScript.includes("assertNoSecretValues"), "launch summary check must reject leaked secret values");
assert(launchSummaryScript.includes("sensitiveEnvNamePattern"), "launch summary check must discover sensitive env names");
assert(launchSummaryScript.includes("forbiddenSecretPatterns"), "launch summary check must reject token-shaped values");
assert(runtimeRunbook.includes("hairstyle:catalog:launch:summary:check"), "runtime smoke runbook missing launch summary check command");
assert(runtimeRunbook.includes("secret-free"), "runtime smoke runbook missing secret-free summary guard");
assert(architectureDoc.includes("secret-free"), "architecture doc missing secret-free summary guard");

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
    "phase docs",
    "remote readiness guard",
    "runtime env preflight",
    "runtime API smoke runner",
    "Cloudflare secret-name smoke guard",
    "cron DB smoke guard",
    "trend mail function smoke guard",
    "trend mail catalog processing evidence",
    "trend mail service-key auth guard",
    "trend mail deploy guard",
    "launch readiness guard",
    "launch summary schema guard",
    "launch summary secret-free guard",
    "active DB smoke guard",
  ],
}, null, 2));
