import assert from "node:assert/strict";
import test from "node:test";
import { compilePromptSpecsV2 } from "@hairfit/shared/v2/prompt";
import type { PromptInputV2 } from "@hairfit/shared/v2";
import type {
  CatalogSelectionContext,
  HairConditionTag,
  HairStrandThickness,
  HairTextureProfile,
  HairstyleCatalogLineupRow,
  HairstyleCatalogRow,
  MemberStyleTarget,
  RecommendationLengthBucket,
} from "./recommendation-types.ts";
import { selectLineupBackedCatalogRows } from "./hairstyle-catalog-recommendation.ts";

test("V4 catalog fills every BALANCE IMAGE and LIFESTYLE length slot for the profile matrix", async () => {
  process.env.HAIRSTYLE_BLUEPRINT_V4_ENABLED = "true";
  process.env.HAIRSTYLE_BLUEPRINT_V4_BATCH = "expansion-c";
  const { buildCatalogRowsForCycle } = await import("./hairstyle-catalog-seed.ts");
  const { buildCatalogLineupsForCycle } = await import("./hairstyle-catalog-lineup.ts");
  const cycleId = "catalog-three-column-fixture";
  const rows = buildCatalogRowsForCycle(
    cycleId,
    "2026-08-20T00:00:00.000Z",
    new Map(),
  ).map((row, index) => ({ ...row, id: `catalog-${index + 1}` })) satisfies HairstyleCatalogRow[];
  const lineups = buildCatalogLineupsForCycle(rows, cycleId, "three-column-seed").map(
    (lineup, index): HairstyleCatalogLineupRow => ({
      id: `lineup-${index + 1}`,
      cycleId: lineup.cycle_id,
      market: lineup.market,
      styleTarget: lineup.style_target,
      slotKey: lineup.slot_key,
      rank: lineup.rank,
      catalogItemId: lineup.catalog_item_id,
      rotationScore: lineup.rotation_score,
      selectionReason: lineup.selection_reason,
      createdAt: "2026-08-20T00:00:00.000Z",
    }),
  );
  const styleTargets: MemberStyleTarget[] = ["male", "female"];
  const desiredLengths: RecommendationLengthBucket[] = ["short", "medium", "long"];
  const textures: HairTextureProfile[] = ["straight", "wavy_curly", "tight_curly_frizzy"];
  const thicknesses: HairStrandThickness[] = ["fine", "medium", "coarse"];
  const conditions: HairConditionTag[] = ["untreated", "damaged", "bleached", "colored"];
  let evaluatedCases = 0;

  for (const styleTarget of styleTargets) {
    for (const desiredLength of desiredLengths) {
      for (const textureType of textures) {
        for (const strandThickness of thicknesses) {
          for (const condition of conditions) {
            const context: CatalogSelectionContext = {
              analysis: {
                faceShape: "oval",
                headShape: "balanced",
                foreheadExposure: "balanced",
                observedPartingShape: "center",
                recommendedPartingShape: "side",
                partingStrategy: "balance",
                balance: "balanced",
                bestLengthStrategy: desiredLength,
                volumeFocus: ["crown"],
                avoidNotes: [],
                summary: "fixture",
              },
              styleTarget,
              faceShapeTags: ["oval"],
              volumeFocusTags: ["crown"],
              partingPreferenceTags: ["side"],
              avoidTags: [],
              preferredLengthBuckets: [desiredLength],
              hairProfile: {
                currentLength: "medium",
                textureType,
                strandThickness,
                conditionTags: [condition],
                damageLevel: "low",
                desiredLength,
                source: "user",
              },
            };
            const selected = selectLineupBackedCatalogRows(
              rows,
              lineups,
              context,
              (row) => row.trendScore + row.freshnessScore,
            );
            assert.equal(selected.length, 9, `${styleTarget}/${desiredLength}/${textureType}/${strandThickness}/${condition}`);
            const promptInput: PromptInputV2 = {
              schemaVersion: "prompt-input-v2",
              consultationId: "00000000-0000-4000-8000-000000000001",
              styleTarget,
              generationInputFingerprint: "three-column-fixture",
              analysisEvidence: {
                id: "00000000-0000-4000-8000-000000000002",
                model: { provider: "fixture", name: "fixture", version: "1" },
                quality: { status: "pass", overall: 1, frontal: 1, lighting: 1, resolution: 1, blur: 1, occlusion: 1, hairlineVisibility: 1, warnings: [] },
                faceShape: { primary: "oval", secondary: null, blend: { oval: 1 }, summary: "balanced" },
              },
              personalColor: null,
              currentHair: { description: "fixture", length: "medium", density: "medium", strandThickness, texture: textureType, treatmentHistory: [condition], damageLevel: "low" },
              styleGoal: { imageKeywords: ["balanced"], desiredLength, changeLevel: "moderate", desiredServices: ["cut"], notes: "fixture" },
              maintenance: { morningMinutes: 10, heatStyling: "sometimes", salonCycleWeeks: 8, maintenanceLevel: "medium" },
              avoidConditions: [],
              catalogCycleId: cycleId,
              catalog: selected.map(({ row }) => ({
                id: row.id,
                cycleId,
                name: row.nameKo,
                lengthBucket: row.lengthBucket,
                design: { lengthBucket: row.lengthBucket },
                promptTemplateVersion: row.promptTemplateVersion,
              })),
            };
            const specs = compilePromptSpecsV2(promptInput);
            assert.equal(new Set(specs.map((spec) => spec.catalogItemId)).size, 9);
            assert.ok(specs.every((spec) => spec.catalogFallbackReason === null));
            assert.ok(specs.every((spec) => spec.catalogLengthBucket === spec.requiredLengthBucket));
            evaluatedCases += 1;
          }
        }
      }
    }
  }

  assert.equal(evaluatedCases, 216);
});
