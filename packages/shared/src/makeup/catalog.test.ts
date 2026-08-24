import assert from "node:assert/strict";
import test from "node:test";
import {
  MAKEUP_PRESENTATION_FAMILIES,
  applyMakeupPracticalityV1,
  applyMakeupRecipeV1,
  presentationFamilyFromGender,
  seedMakeupRecipeModulesV1,
  validateMakeupRecipeCatalogV1,
  type MakeupPresentationFamilyV1,
  type MakeupRecipeV1,
} from "./catalog.ts";
import { MAKEUP_MODULES, type MakeupModuleDirection } from "./contract.ts";
import { MAKEUP_MODES, type MakeupMode } from "./interview.ts";

const fingerprint = "a".repeat(64);

function recipe(family: MakeupPresentationFamilyV1, mode: MakeupMode): MakeupRecipeV1 {
  return {
    schemaVersion: "makeup-recipe-v1",
    id: `${family}-${mode}`,
    cycleId: "cycle-v1",
    cycleVersion: 1,
    presentationFamily: family,
    mode,
    modules: seedMakeupRecipeModulesV1(family, mode),
    fingerprint,
  };
}

function catalog() {
  return MAKEUP_PRESENTATION_FAMILIES.flatMap((family) => MAKEUP_MODES.map((mode) => recipe(family, mode)));
}

function baseModules(): MakeupModuleDirection[] {
  return MAKEUP_MODULES.map((module) => ({
    module,
    state: "enabled",
    geometry: { coordinateSpace: "normalized_source_image", anchors: [], polygons: [], excludedPolygons: [], vectors: [] },
    direction: {
      enabled: true,
      intensity: 0.8,
      colorFamily: null,
      texture: "natural",
      evidenceIds: [],
      reasons: [],
      technical: {
        kind: module,
        zonePolicyVersion: "makeup-zone-policy-v1",
        placement: [],
        applicationDirection: [],
        finish: "natural",
        technique: "base-technique",
        productAttributes: [],
        warnings: [],
        parameters: {},
      },
    },
  }));
}

test("catalog seed covers exactly three presentation families by six modes", () => {
  assert.deepEqual(validateMakeupRecipeCatalogV1(catalog()), { valid: true, errors: [], entryCount: 18 });
  const duplicate = [...catalog(), recipe("masculine", "daily_natural")];
  assert.match(validateMakeupRecipeCatalogV1(duplicate).errors.join(" "), /DUPLICATE|ENTRY_COUNT/);
  assert.match(validateMakeupRecipeCatalogV1(catalog().slice(1)).errors.join(" "), /MISSING/);
});

test("profile gender maps only supported values and otherwise stays neutral", () => {
  assert.equal(presentationFamilyFromGender("male"), "masculine");
  assert.equal(presentationFamilyFromGender("female"), "feminine");
  assert.equal(presentationFamilyFromGender("nonbinary"), "neutral");
  assert.equal(presentationFamilyFromGender(null), "neutral");
});

test("daily defaults differ while color-visible modes open all seven zones", () => {
  assert.deepEqual(seedMakeupRecipeModulesV1("masculine", "daily_natural").filter((item) => item.defaultEnabled).map((item) => item.module), ["base", "brow", "eyeshadow", "blush", "lip"]);
  assert.equal(seedMakeupRecipeModulesV1("feminine", "daily_natural").filter((item) => item.defaultEnabled).length, 7);
  assert.deepEqual(seedMakeupRecipeModulesV1("neutral", "daily_natural").filter((item) => !item.defaultEnabled).map((item) => item.module), ["lashes"]);
  for (const family of MAKEUP_PRESENTATION_FAMILIES) {
    const softBlend = seedMakeupRecipeModulesV1(family, "soft_blend");
    assert.equal(softBlend.every((item) => item.defaultEnabled && item.intensityMultiplier >= 0.9), true);
  }
});

test("customer exclusion remains authoritative over recipe activation", () => {
  const modules = baseModules();
  const lip = modules.find((item) => item.module === "lip")!;
  lip.state = "disabled_by_user";
  lip.direction.enabled = false;
  const applied = applyMakeupRecipeV1(modules, recipe("feminine", "soft_blend"));
  const appliedLip = applied.find((item) => item.module === "lip")!;
  assert.equal(appliedLip.state, "disabled_by_user");
  assert.equal(appliedLip.direction.enabled, false);
  assert.equal(applied.find((item) => item.module === "eyeshadow")!.direction.intensity, 0.8);
});

test("invalid technique token and multiplier are rejected", () => {
  const invalid = recipe("masculine", "daily_natural");
  invalid.modules[0].techniqueTokens = ["free_form_prompt" as never];
  invalid.modules[1].intensityMultiplier = 2;
  const result = validateMakeupRecipeCatalogV1([invalid, ...catalog().slice(1)]);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /MAKEUP_RECIPE_POLICY_INVALID/);
});

test("time and skill reduce complexity without changing recipe activation", () => {
  const source = baseModules();
  source.forEach((item) => { item.direction.texture = "glow"; });
  const applied = applyMakeupRecipeV1(source, recipe("masculine", "soft_blend"));
  const compact = applyMakeupPracticalityV1(applied, {
    presentation: "defined", makeupMode: "soft_blend", occasions: ["daily"], preparationMinutes: 5, skillLevel: "none", finishPreference: "glow",
    exclusions: [], ownedProductTypes: [], ownedToolTypes: [], gender: "male", facialHair: { type: "none", userWantsCoverage: false },
  });
  assert.equal(compact.every((item) => item.state === "enabled" && item.direction.enabled), true);
  assert.equal(compact.every((item, index) => item.direction.intensity <= applied[index].direction.intensity), true);
  assert.equal(compact.every((item) => (item.direction.technical.parameters.recipeTechniqueTokens as string[]).length <= 1), true);
  assert.equal(compact.every((item) => item.direction.texture === "glow"), true);
});
