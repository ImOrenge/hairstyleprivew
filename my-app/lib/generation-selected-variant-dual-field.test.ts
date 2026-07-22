import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationName = "20260717153000_generation_selected_variant_dual_field.sql";

function read(relativeUrl: string) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

test("selected variant migration is additive, mirrored, and time-bounded", () => {
  const rootMigration = read(`../../supabase/migrations/${migrationName}`);
  const appMigration = read(`../supabase/migrations/${migrationName}`);

  assert.equal(appMigration, rootMigration);
  assert.match(rootMigration, /add column if not exists selected_variant_id text/);
  assert.match(rootMigration, /set selected_variant_id = nullif\([\s\S]*recommendationSet,selectedVariantId/);
  assert.match(rootMigration, /generation_selected_variant_dual_write_trigger/);
  assert.match(rootMigration, /generations_selected_variant_fields_match/);
  assert.match(rootMigration, /generation_selected_variant_conflict/);
  assert.match(rootMigration, /generation_selected_variant_not_found/);
  assert.match(rootMigration, /two compatible releases and 30 days of zero mismatch telemetry/);
});

test("generation detail dual-reads the public field before legacy JSON", () => {
  const route = read("../app/api/generations/[id]/route.ts");
  const shared = read("../../packages/shared/src/index.ts");

  assert.match(route, /generated_assets_expires_at,selected_variant_id,options/);
  assert.match(route, /isMissingSelectedVariantColumn\(result\.error\)/);
  assert.match(route, /select\(LEGACY_GENERATION_DETAIL_SELECT\)/);
  assert.match(
    route,
    /normalizeSelectedVariantId\(preferredSelectedVariantId\) \?\?[\s\S]*normalizeSelectedVariantId\(raw\.selectedVariantId\)/,
  );
  assert.match(route, /selectedVariantId: recommendationSet\?\.selectedVariantId \?\? null/);
  assert.match(shared, /recommendationSet: TRecommendationSet \| null;\s+selectedVariantId: string \| null;/);
});

test("selection writes both public and legacy fields while preserving the lock", () => {
  const route = read("../app/api/generations/[id]/route.ts");

  assert.match(route, /selected_variant_id: selectedVariantId/);
  assert.match(route, /recommendationSet\.selectedVariantId = selectedVariantId/);
  assert.match(route, /isMissingSelectedVariantColumn\(error\)/);
  assert.match(route, /update\(generationUpdate\)/);
  assert.match(route, /selection_locked_after_confirmation/);
  assert.match(route, /lockedVariantId !== selectedVariantId/);
});
