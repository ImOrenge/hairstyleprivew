import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const blueprintAudit = spawnSync(process.execPath, [fileURLToPath(new URL("./audit-hairstyle-catalog-blueprints.mjs", import.meta.url))], {
  encoding: "utf8",
});

if (blueprintAudit.status !== 0) {
  throw new Error(blueprintAudit.stderr || blueprintAudit.stdout || "blueprint audit failed");
}

const catalog = read("lib/hairstyle-catalog.ts");
const trendResearch = read("lib/hairstyle-trend-research.ts");
const rotationMigration = read("supabase/migrations/20260703092000_hairstyle_catalog_rotation.sql");
const cronMigration = read("supabase/migrations/20260703093000_hairstyle_catalog_rotation_cron.sql");

assert(trendResearch.includes("PRIMARY_RESEARCH_LOOKBACK_DAYS = 60"), "missing 60 day primary lookback");
assert(trendResearch.includes("FALLBACK_RESEARCH_LOOKBACK_DAYS = 120"), "missing 120 day fallback lookback");
assert(!trendResearch.includes("RESEARCH_LOOKBACK_DAYS = 240"), "hair trend research still uses 240 day lookback");
assert(catalog.includes("export async function ensureCatalogAvailable()"), "missing active catalog availability function");
const ensureBody = catalog.match(/export async function ensureCatalogAvailable\(\)[\s\S]*?function filterRowsForStyleTarget/);
assert(ensureBody && !ensureBody[0].includes("rebuildWeeklyHairstyleCatalog("), "user recommendation path still triggers rebuild");
assert(catalog.includes("enqueueCatalogRotationTrendAlert"), "missing trend alert enqueue service hook");
assert(catalog.includes("trend_alert_enqueue_failed"), "missing alert enqueue failure isolation warning");
assert(catalog.includes("buildCatalogLineupsForCycle"), "missing catalog lineup builder");
assert(rotationMigration.includes("idx_trend_alerts_catalog_cycle_alert_type"), "missing trend alert idempotency index");
assert(rotationMigration.includes("hairstyle_catalog_active_cycles"), "missing active catalog table migration");
assert(cronMigration.includes("cron-hairstyle-catalog-rotation-check"), "missing rotation cron job name");
assert(cronMigration.includes("cron-trend-emails-post-rotation"), "missing post rotation mail cron job name");
assert(cronMigration.includes("'onlyIfDue', true"), "rotation cron does not send onlyIfDue");
assert(cronMigration.includes("'x-admin-secret'"), "rotation cron does not send admin secret header");

console.log(JSON.stringify({
  ok: true,
  checks: [
    "blueprints",
    "lookback",
    "active-only recommendation path",
    "trend alert idempotency",
    "lineup builder",
    "cron names",
  ],
}, null, 2));
