import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      resolveJsonModule: true,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const MANIFEST_SPECS = [
  ["female-short.json", "female", "short"],
  ["female-medium.json", "female", "medium"],
  ["female-long.json", "female", "long"],
  ["male-short.json", "male", "short"],
  ["male-medium.json", "male", "medium"],
  ["male-long.json", "male", "long"],
];
const TEXTURES = ["straight", "wavy_curly", "tight_curly_frizzy"];
const CONDITIONS = ["untreated", "damaged", "bleached", "colored"];
const STRAND_THICKNESSES = ["fine", "medium", "coarse"];
const BATCHES = ["expansion-a", "expansion-b", "expansion-c"];

process.env.HAIRSTYLE_BLUEPRINT_V4_ENABLED = "true";
process.env.HAIRSTYLE_RSS_FACETS_V2_ENABLED = "true";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readManifest(fileName) {
  return JSON.parse(
    readFileSync(new URL(`../data/hairstyle-blueprints/v4/${fileName}`, import.meta.url), "utf8"),
  );
}

const manifests = MANIFEST_SPECS.flatMap(([fileName, styleTarget, lengthBucket]) => {
  const rows = readManifest(fileName);
  assert(Array.isArray(rows), `${fileName} must contain an array`);
  assert(rows.length === 25, `${fileName} must contain exactly 25 blueprints, got ${rows.length}`);
  for (const row of rows) {
    assert(row.styleTargets?.length === 1 && row.styleTargets[0] === styleTarget, `${row.slug}: style target mismatch`);
    assert(row.lengthBucket === lengthBucket, `${row.slug}: length bucket mismatch`);
  }
  return rows;
});

assert(manifests.length === 150, `expected 150 expansion blueprints, got ${manifests.length}`);

const slugSet = new Set();
const variantSet = new Set();
const cellCounts = new Map();
const batchCounts = Object.fromEntries(BATCHES.map((batch) => [batch, 0]));

for (const row of manifests) {
  assert(typeof row.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug), `invalid slug: ${row.slug}`);
  assert(!slugSet.has(row.slug), `duplicate slug: ${row.slug}`);
  slugSet.add(row.slug);

  const variantIdentity = `${row.styleTargets[0]}:${row.lengthBucket}:${row.styleFamily}:${row.variantKey}`;
  assert(!variantSet.has(variantIdentity), `duplicate variant identity: ${variantIdentity}`);
  variantSet.add(variantIdentity);

  assert(TEXTURES.includes(row.primaryTexture), `${row.slug}: invalid primary texture`);
  assert(CONDITIONS.includes(row.primaryCondition), `${row.slug}: invalid primary condition`);
  assert(STRAND_THICKNESSES.includes(row.primaryStrandThickness), `${row.slug}: invalid strand thickness`);
  assert(row.compatibleTextureTags?.includes(row.primaryTexture), `${row.slug}: primary texture must be compatible`);
  assert(row.compatibleConditionTags?.includes(row.primaryCondition), `${row.slug}: primary condition must be compatible`);
  assert(row.compatibleStrandThicknessTags?.includes(row.primaryStrandThickness), `${row.slug}: primary strand thickness must be compatible`);
  assert(Array.isArray(row.requiredServices) && row.requiredServices.length > 0, `${row.slug}: required services missing`);
  assert(Array.isArray(row.serviceConstraints) && row.serviceConstraints.length > 0, `${row.slug}: service constraints missing`);
  assert(Array.isArray(row.trendKeywords) && row.trendKeywords.length >= 5, `${row.slug}: trend keywords below 5`);
  assert(row.promptTemplateVersion === "catalog-v4", `${row.slug}: prompt version mismatch`);
  assert(!/change (the )?(face|identity|skin tone|gender)/i.test(row.promptTemplate), `${row.slug}: unsafe prompt`);
  assert(BATCHES.includes(row.introducedIn), `${row.slug}: invalid expansion batch`);
  batchCounts[row.introducedIn] += 1;

  const cellKey = [row.styleTargets[0], row.lengthBucket, row.primaryTexture, row.primaryCondition].join(":");
  cellCounts.set(cellKey, (cellCounts.get(cellKey) || 0) + 1);
}

for (const styleTarget of ["female", "male"]) {
  for (const lengthBucket of ["short", "medium", "long"]) {
    const group = manifests.filter(
      (row) => row.styleTargets[0] === styleTarget && row.lengthBucket === lengthBucket,
    );
    assert(group.length === 25, `${styleTarget}/${lengthBucket}: expected 25, got ${group.length}`);

    const textureCounts = Object.fromEntries(TEXTURES.map((texture) => [texture, 0]));
    const conditionCounts = Object.fromEntries(CONDITIONS.map((condition) => [condition, 0]));
    const strandThicknessCounts = Object.fromEntries(STRAND_THICKNESSES.map((thickness) => [thickness, 0]));
    for (const row of group) {
      textureCounts[row.primaryTexture] += 1;
      conditionCounts[row.primaryCondition] += 1;
      strandThicknessCounts[row.primaryStrandThickness] += 1;
    }
    assert(textureCounts.straight === 8, `${styleTarget}/${lengthBucket}: straight count must be 8`);
    assert(textureCounts.wavy_curly === 9, `${styleTarget}/${lengthBucket}: wavy count must be 9`);
    assert(textureCounts.tight_curly_frizzy === 8, `${styleTarget}/${lengthBucket}: tight curl count must be 8`);
    assert(conditionCounts.untreated === 7, `${styleTarget}/${lengthBucket}: untreated count must be 7`);
    for (const condition of ["damaged", "bleached", "colored"]) {
      assert(conditionCounts[condition] === 6, `${styleTarget}/${lengthBucket}: ${condition} count must be 6`);
    }
    assert(strandThicknessCounts.fine === 8, `${styleTarget}/${lengthBucket}: fine strand count must be 8`);
    assert(strandThicknessCounts.medium === 9, `${styleTarget}/${lengthBucket}: medium strand count must be 9`);
    assert(strandThicknessCounts.coarse === 8, `${styleTarget}/${lengthBucket}: coarse strand count must be 8`);
  }
}

for (const styleTarget of ["female", "male"]) {
  for (const lengthBucket of ["short", "medium", "long"]) {
    for (const texture of TEXTURES) {
      for (const condition of CONDITIONS) {
        const key = [styleTarget, lengthBucket, texture, condition].join(":");
        assert(cellCounts.get(key) >= 2, `${key}: expected at least 2 expansion blueprints`);
      }
    }
  }
}

for (const batch of BATCHES) {
  assert(batchCounts[batch] === 50, `${batch}: expected 50, got ${batchCounts[batch]}`);
}

const {
  buildCatalogRowsForCycle,
  buildKoreanWeeklyStyleQueries,
  buildKoreanWeeklyStyleQueryRegistry,
  KOREAN_HAIRSTYLE_BLUEPRINTS,
} = require("../lib/hairstyle-catalog-seed.ts");
assert(KOREAN_HAIRSTYLE_BLUEPRINTS.length === 182, `expected total pool 182, got ${KOREAN_HAIRSTYLE_BLUEPRINTS.length}`);

const rows = buildCatalogRowsForCycle("00000000-0000-0000-0000-000000000000", new Date(0).toISOString(), new Map());
assert(rows.length === 182, `expected 182 built rows, got ${rows.length}`);
assert(new Set(rows.map((row) => row.slug)).size === 182, "built rows contain duplicate slugs");

const femaleCandidates = rows.filter((row) => row.styleTargets.includes("female")).length;
const maleCandidates = rows.filter((row) => row.styleTargets.includes("male")).length;
assert(femaleCandidates === 93, `expected 93 female candidates, got ${femaleCandidates}`);
assert(maleCandidates === 93, `expected 93 male candidates, got ${maleCandidates}`);

const queryRegistry = buildKoreanWeeklyStyleQueryRegistry(new Date("2026-08-08T00:00:00Z"));
assert(queryRegistry.length === 60, `expected 60 structured RSS queries, got ${queryRegistry.length}`);
assert(new Set(queryRegistry.map((query) => query.id)).size === 60, "RSS query ids must be unique");
assert(queryRegistry.filter((query) => query.textureFacet).length === 18, "expected 18 texture facet queries");
assert(queryRegistry.filter((query) => query.strandThicknessFacet).length === 18, "expected 18 strand thickness facet queries");
assert(queryRegistry.filter((query) => query.conditionFacet).length === 18, "expected 18 condition facet queries");

process.env.HAIRSTYLE_BLUEPRINT_V4_ENABLED = "false";
process.env.HAIRSTYLE_RSS_FACETS_V2_ENABLED = "false";
const rollbackRows = buildCatalogRowsForCycle("00000000-0000-0000-0000-000000000000", new Date(0).toISOString(), new Map());
assert(rollbackRows.length === 32, `blueprint rollback flag must restore 32 rows, got ${rollbackRows.length}`);
assert(buildKoreanWeeklyStyleQueries(new Date("2026-08-08T00:00:00Z")).length === 11, "RSS rollback flag must restore 11 queries");
process.env.HAIRSTYLE_BLUEPRINT_V4_ENABLED = "true";
process.env.HAIRSTYLE_RSS_FACETS_V2_ENABLED = "true";
assert(buildKoreanWeeklyStyleQueries(new Date("2026-08-08T00:00:00Z")).length === 60, "RSS feature flag must enable 60 queries");

const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} };
const { buildCatalogSelectionContext, buildLineupBackedRecommendations } = require("../lib/hairstyle-catalog.ts");
const persistedRows = rows.map((row) => ({ ...row, id: row.slug }));
const femaleRows = persistedRows.filter((row) => row.styleTargets.includes("female"));
const syntheticLineups = femaleRows.map((row, index) => ({
  id: `lineup-${index}`,
  cycleId: row.sourceCycleId,
  market: row.market,
  styleTarget: "female",
  slotKey: index < 3 ? "trend" : "evergreen",
  rank: index + 1,
  catalogItemId: row.id,
  rotationScore: 50,
  selectionReason: "audit fixture",
  createdAt: row.createdAt,
}));
const analysis = {
  faceShape: "oval",
  headShape: "balanced",
  foreheadExposure: "balanced",
  observedPartingShape: "soft off-center parting",
  recommendedPartingShape: "soft off-center parting",
  partingStrategy: "soft off-center parting",
  balance: "balanced",
  bestLengthStrategy: "compare short medium long",
  volumeFocus: ["crown"],
  avoidNotes: [],
  summary: "audit fixture",
};
const profile = {
  currentLength: "unknown",
  textureType: "tight_curly_frizzy",
  strandThickness: "coarse",
  conditionTags: ["bleached"],
  damageLevel: "medium",
  desiredLength: null,
  source: "user",
};
const selectionContext = buildCatalogSelectionContext(analysis, "female", profile);
const recommendations = buildLineupBackedRecommendations(
  femaleRows,
  syntheticLineups,
  selectionContext,
  "00000000-0000-0000-0000-000000000000",
);
assert(recommendations.length === 9, `known profile must produce 9 recommendations, got ${recommendations.length}`);
for (const bucket of ["short", "medium", "long"]) {
  assert(recommendations.filter((item) => item.lengthBucket === bucket).length === 3, `${bucket}: expected 3 recommendations`);
}
const recommendedRows = recommendations.map((item) => femaleRows.find((row) => row.id === item.catalogItemId));
assert(recommendedRows.every(Boolean), "recommendation fixture contains unknown catalog rows");
assert(recommendedRows.every((row) => !row.avoidStrandThicknessTags.includes("coarse")), "hard strand conflict escaped filtering");
assert(recommendedRows.every((row) => !row.avoidConditionTags.includes("bleached")), "hard condition conflict escaped filtering");
assert(
  recommendedRows.filter((row) => row.compatibleTextureTags.includes("tight_curly_frizzy") && row.compatibleStrandThicknessTags.includes("coarse")).length >= 6,
  "known profile must include at least 6 texture-and-thickness compatible recommendations",
);
const familyCounts = new Map();
for (const row of recommendedRows) familyCounts.set(row.styleFamily, (familyCounts.get(row.styleFamily) || 0) + 1);
assert([...familyCounts.values()].every((count) => count <= 2), "same style family must appear at most twice");

for (const row of rows) {
  assert(row.styleFamily, `${row.slug}: built style family missing`);
  assert(row.variantKey, `${row.slug}: built variant key missing`);
  assert(row.compatibleTextureTags.length > 0, `${row.slug}: built texture compatibility missing`);
  assert(row.compatibleConditionTags.length > 0, `${row.slug}: built condition compatibility missing`);
  assert(row.compatibleStrandThicknessTags.length > 0, `${row.slug}: built strand thickness compatibility missing`);
}

console.log(JSON.stringify({
  ok: true,
  totalBlueprints: rows.length,
  legacyBlueprints: rows.filter((row) => row.introducedIn === "legacy-32").length,
  expansionBlueprints: manifests.length,
  femaleCandidates,
  maleCandidates,
  coverageCells: cellCounts.size,
  rssQueryCount: queryRegistry.length,
  batchCounts,
}, null, 2));
