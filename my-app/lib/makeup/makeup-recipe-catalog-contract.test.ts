import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildOpenAIMakeupStyleSimulationPrompt } from "./makeup-simulation-prompt.ts";
import { isMakeupRecipeCatalogEnabled, isMakeupRecipeCatalogShadowEnabled } from "../consulting/feature-flag.ts";

const rootMigration = new URL("../../../supabase/migrations/20260824120000_makeup_recipe_catalog_v1.sql", import.meta.url);
const appMigration = new URL("../../supabase/migrations/20260824120000_makeup_recipe_catalog_v1.sql", import.meta.url);

test("makeup recipe flags are fail-closed", () => {
  assert.equal(isMakeupRecipeCatalogEnabled({}), false);
  assert.equal(isMakeupRecipeCatalogShadowEnabled({}), false);
  assert.equal(isMakeupRecipeCatalogEnabled({ MAKEUP_RECIPE_CATALOG_ENABLED: "true" }), true);
  assert.equal(isMakeupRecipeCatalogShadowEnabled({ MAKEUP_RECIPE_CATALOG_SHADOW_ENABLED: "true" }), true);
});

test("prompt compiles only allowlisted technique tokens and protects identity", () => {
  const prompt = buildOpenAIMakeupStyleSimulationPrompt({
    mode: "soft_blend",
    palette: ["muted rose"],
    presentationFamily: "masculine",
    recipeId: "recipe-soft-blend",
    occasion: "daily",
    preparationMinutes: 10,
    skillLevel: "basic",
    facialHair: { type: "stubble", userWantsCoverage: false },
    exclusions: ["no shimmer"],
    modules: [{ module: "eyeshadow", enabled: true, color: "muted rose", intensity: 45, finish: "natural", paletteRole: "eye_harmony", techniqueTokens: ["close_lash_shadow", "buy_product_x"] }],
  });
  assert.match(prompt, /Validated recipe reference: recipe-soft-blend/);
  assert.match(prompt, /eyeshadow: enabled/);
  assert.match(prompt, /keep shadow close to the lash line/);
  assert.doesNotMatch(prompt, /buy_product_x/);
  assert.match(prompt, /Never change sex, gender presentation, identity, face, or body/);
  assert.match(prompt, /Preserve facial-hair boundaries/);
});

test("migration mirrors DB snapshot, RLS, validation, activation and rollback contracts", () => {
  const root = readFileSync(rootMigration, "utf8");
  const mirror = readFileSync(appMigration, "utf8");
  assert.equal(mirror, root);
  assert.match(root, /create table public\.makeup_recipe_catalog_cycles/);
  assert.match(root, /create table public\.makeup_recipe_catalog_entries/);
  assert.match(root, /force row level security/g);
  assert.match(root, /set search_path = ''/g);
  assert.match(root, /revoke all on function public\.activate_makeup_recipe_catalog_cycle_v1/);
  assert.match(root, /create or replace function public\.create_makeup_recipe_catalog_cycle_v1/);
  assert.match(root, /jsonb_array_length\(p_entries\) <> 18/);
  assert.match(root, /v_count <> 18/);
  assert.match(root, /'retired','active'/);
});

test("source and direction paths freeze the recipe and prefer confirmed hair", () => {
  const source = readFileSync(new URL("./makeup-source-image-server.ts", import.meta.url), "utf8");
  const direction = readFileSync(new URL("./makeup-direction-server.ts", import.meta.url), "utf8");
  const simulation = readFileSync(new URL("./makeup-simulation-server.ts", import.meta.url), "utf8");
  assert.ok(source.indexOf('kind: "confirmed_hair"') < source.indexOf('kind: "retained_original"'));
  assert.match(direction, /recipe_catalog_cycle_id: snapshot\.recipeBinding\?\.cycleId/);
  assert.match(direction, /makeup\.recipe_catalog\.shadow_compared/);
  assert.match(simulation, /schemaVersion: "makeup-simulation-input-v2"/);
  assert.match(simulation, /recipeFingerprint/);
});

test("catalog administration is API-only, RBAC protected and transaction backed", () => {
  const route = readFileSync(new URL("../../app/api/admin/makeup-recipe-catalog/route.ts", import.meta.url), "utf8");
  const service = readFileSync(new URL("./makeup-recipe-catalog-server.ts", import.meta.url), "utf8");
  assert.match(route, /getAdminApiContext/);
  assert.match(route, /action === "create"/);
  assert.match(route, /action === "activate" \|\| action === "rollback"/);
  assert.match(service, /create_makeup_recipe_catalog_cycle_v1/);
  assert.match(service, /validateMakeupRecipeCatalogV1/);
  assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY|dangerouslySetInnerHTML/);
});
