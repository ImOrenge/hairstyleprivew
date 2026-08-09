import assert from "node:assert/strict";
import test from "node:test";

import { buildCatalogLineupsForCycle } from "./hairstyle-catalog-lineup.ts";
import { selectLineupBackedCatalogRows } from "./hairstyle-catalog-recommendation.ts";
import { buildCatalogRowsForCycle } from "./hairstyle-catalog-seed.ts";
import type {
  CatalogSelectionContext,
  CurrentHairProfile,
  FaceAnalysisSummary,
  HairConditionTag,
  HairStrandThickness,
  HairTextureProfile,
  HairstyleCatalogLineupRow,
  HairstyleCatalogRow,
  MemberStyleTarget,
  RecommendationLengthBucket,
} from "./recommendation-types.ts";

const CYCLE_ID = "00000000-0000-0000-0000-000000000001";
const NOW_ISO = "2026-08-08T00:00:00.000Z";

const ANALYSIS: FaceAnalysisSummary = {
  faceShape: "oval",
  headShape: "balanced",
  foreheadExposure: "balanced",
  observedPartingShape: "soft off-center parting",
  recommendedPartingShape: "soft off-center parting",
  partingStrategy: "soft off-center parting",
  balance: "balanced",
  bestLengthStrategy: "compare short medium and long",
  volumeFocus: ["crown", "temple"],
  avoidNotes: [],
  summary: "Neutral deterministic recommendation fixture.",
};

function buildFixture(blueprintV4Enabled = true) {
  process.env.HAIRSTYLE_BLUEPRINT_V4_ENABLED = blueprintV4Enabled ? "true" : "false";
  process.env.HAIRSTYLE_BLUEPRINT_V4_BATCH = "expansion-c";
  const rows: HairstyleCatalogRow[] = buildCatalogRowsForCycle(CYCLE_ID, NOW_ISO, new Map())
    .map((row, index) => ({ ...row, id: `catalog-${index + 1}` }));
  const lineups: HairstyleCatalogLineupRow[] = buildCatalogLineupsForCycle(rows, CYCLE_ID, "recommendation-contract")
    .map((lineup, index) => ({
      id: `lineup-${index + 1}`,
      cycleId: lineup.cycle_id,
      market: lineup.market,
      styleTarget: lineup.style_target,
      slotKey: lineup.slot_key,
      rank: lineup.rank,
      catalogItemId: lineup.catalog_item_id,
      rotationScore: lineup.rotation_score,
      selectionReason: lineup.selection_reason,
      createdAt: NOW_ISO,
    }));
  return { rows, lineups };
}

test("v4 runtime loader exposes expansion batches cumulatively and fails closed", () => {
  process.env.HAIRSTYLE_BLUEPRINT_V4_ENABLED = "true";

  for (const [batch, expectedCount] of [
    ["expansion-a", 82],
    ["expansion-b", 132],
    ["expansion-c", 182],
  ] as const) {
    process.env.HAIRSTYLE_BLUEPRINT_V4_BATCH = batch;
    const rows = buildCatalogRowsForCycle(CYCLE_ID, NOW_ISO, new Map());
    assert.equal(rows.length, expectedCount, `${batch} must expose the cumulative rollout pool`);
    assert.ok(rows.every((row) => row.promptTemplateVersion === "catalog-v4"));
  }

  process.env.HAIRSTYLE_BLUEPRINT_V4_BATCH = "unexpected";
  const invalidBatchRows = buildCatalogRowsForCycle(CYCLE_ID, NOW_ISO, new Map());
  assert.equal(invalidBatchRows.length, 32, "an invalid batch must fail closed to the legacy pool");
  assert.ok(invalidBatchRows.every((row) => row.promptTemplateVersion === "catalog-v3"));

  process.env.HAIRSTYLE_BLUEPRINT_V4_ENABLED = "false";
  process.env.HAIRSTYLE_BLUEPRINT_V4_BATCH = "expansion-c";
});

function hasHardConflict(row: HairstyleCatalogRow, profile: CurrentHairProfile) {
  return row.avoidTextureTags.includes(profile.textureType as HairTextureProfile) ||
    row.avoidStrandThicknessTags.includes(profile.strandThickness as HairStrandThickness) ||
    profile.conditionTags.some((condition) => row.avoidConditionTags.includes(condition)) ||
    (profile.damageLevel === "high" && row.requiredServices.some((service) =>
      service === "bleach" || service === "straightening" || service === "perm"
    ));
}

function isTextureAndThicknessCompatible(row: HairstyleCatalogRow, profile: CurrentHairProfile) {
  const texture = profile.textureType as HairTextureProfile;
  const thickness = profile.strandThickness as HairStrandThickness;
  return (row.primaryTexture === texture || row.compatibleTextureTags.includes(texture)) &&
    (row.primaryStrandThickness === thickness || row.compatibleStrandThicknessTags.includes(thickness));
}

function assertRecommendationContract(
  rows: HairstyleCatalogRow[],
  lineups: HairstyleCatalogLineupRow[],
  styleTarget: MemberStyleTarget,
  profile: CurrentHairProfile,
) {
  const targetRows = rows.filter((row) => row.styleTargets.includes(styleTarget));
  const context: CatalogSelectionContext = {
    analysis: ANALYSIS,
    styleTarget,
    faceShapeTags: ["oval", "balanced"],
    volumeFocusTags: ["crown", "temple"],
    partingPreferenceTags: ["soft", "off", "center", "parting"],
    avoidTags: [],
    preferredLengthBuckets: [profile.desiredLength || "medium", "long", "short"],
    hairProfile: profile,
  };
  const selections = selectLineupBackedCatalogRows(
    targetRows,
    lineups,
    context,
    (row) => row.trendScore * 0.35 + row.freshnessScore * 0.25,
  );
  const selectedRows = selections.map((item) => item.row);

  const fixtureName = `${styleTarget}/${profile.desiredLength}/${profile.textureType}/${profile.strandThickness}/${profile.conditionTags.join("+")}/${profile.damageLevel}`;
  assert.equal(selections.length, 9, `${fixtureName} must return 9 recommendations`);
  assert.equal(new Set(selectedRows.map((row) => row.id)).size, 9, `${fixtureName} must not repeat rows`);
  assert.equal(selectedRows.filter((row) => hasHardConflict(row, profile)).length, 0, `${fixtureName} must exclude hard conflicts`);
  assert.ok(
    selectedRows.filter((row) => isTextureAndThicknessCompatible(row, profile)).length >= 6,
    `${fixtureName} must include at least 6 texture-and-thickness-compatible rows`,
  );

  const familyCounts = new Map<string, number>();
  const lengthCounts = new Map<RecommendationLengthBucket, number>([["short", 0], ["medium", 0], ["long", 0]]);
  for (const row of selectedRows) {
    familyCounts.set(row.styleFamily, (familyCounts.get(row.styleFamily) || 0) + 1);
    lengthCounts.set(row.lengthBucket, (lengthCounts.get(row.lengthBucket) || 0) + 1);
  }
  assert.ok([...familyCounts.values()].every((count) => count <= 2), `${fixtureName} must cap each style family at 2`);
  assert.equal(lengthCounts.get(profile.desiredLength || "medium"), 6, `${fixtureName} must prioritize the desired length`);
  assert.ok([...lengthCounts.values()].every((count) => count > 0), `${fixtureName} must retain short, medium, and long comparison coverage`);
}

test("v4 catalog satisfies the personalized 9-result contract across all core profile facets", () => {
  const { rows, lineups } = buildFixture();
  const styleTargets: MemberStyleTarget[] = ["female", "male"];
  const lengths: RecommendationLengthBucket[] = ["short", "medium", "long"];
  const textures: HairTextureProfile[] = ["straight", "wavy_curly", "tight_curly_frizzy"];
  const thicknesses: HairStrandThickness[] = ["fine", "medium", "coarse"];
  const conditions: HairConditionTag[][] = [["untreated"], ["damaged"], ["bleached"], ["colored"]];

  for (const styleTarget of styleTargets) {
    for (const desiredLength of lengths) {
      for (const textureType of textures) {
        for (const strandThickness of thicknesses) {
          for (const conditionTags of conditions) {
            assertRecommendationContract(rows, lineups, styleTarget, {
              currentLength: desiredLength,
              desiredLength,
              textureType,
              strandThickness,
              conditionTags,
              damageLevel: conditionTags.includes("damaged") ? "medium" : "low",
              source: "user",
            });
          }
          assertRecommendationContract(rows, lineups, styleTarget, {
            currentLength: desiredLength,
            desiredLength,
            textureType,
            strandThickness,
            conditionTags: ["bleached", "damaged"],
            damageLevel: "high",
            source: "user",
          });
        }
      }
    }
  }
});

test("v4 rollback preserves the legacy 32-row lineup-first comparison contract", () => {
  const { rows, lineups } = buildFixture(false);
  assert.equal(rows.length, 32);
  assert.ok(rows.every((row) => row.promptTemplateVersion === "catalog-v3"));

  for (const styleTarget of ["female", "male"] as const) {
    const targetRows = rows.filter((row) => row.styleTargets.includes(styleTarget));
    const context: CatalogSelectionContext = {
      analysis: ANALYSIS,
      styleTarget,
      faceShapeTags: ["oval", "balanced"],
      volumeFocusTags: ["crown", "temple"],
      partingPreferenceTags: ["soft", "off", "center", "parting"],
      avoidTags: [],
      preferredLengthBuckets: ["short", "medium", "long"],
      hairProfile: null,
    };
    const selections = selectLineupBackedCatalogRows(
      targetRows,
      lineups,
      context,
      (row) => row.trendScore * 0.35 + row.freshnessScore * 0.25,
    );
    const lengthCounts = new Map<RecommendationLengthBucket, number>([["short", 0], ["medium", 0], ["long", 0]]);
    const familyCounts = new Map<string, number>();
    for (const { row } of selections) {
      lengthCounts.set(row.lengthBucket, (lengthCounts.get(row.lengthBucket) || 0) + 1);
      familyCounts.set(row.styleFamily, (familyCounts.get(row.styleFamily) || 0) + 1);
    }

    assert.equal(selections.length, 9, `${styleTarget} rollback must return 9 recommendations`);
    assert.deepEqual(Object.fromEntries(lengthCounts), { short: 3, medium: 3, long: 3 });
    assert.ok([...familyCounts.values()].every((count) => count <= 2));
  }
});
