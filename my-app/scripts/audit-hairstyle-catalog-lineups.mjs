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
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });

  module._compile(outputText, filename);
};

const { buildCatalogRowsForCycle } = require("../lib/hairstyle-catalog-seed.ts");
const { HAIRSTYLE_CATALOG_LINEUP_SIZE, buildCatalogLineupsForCycle } = require("../lib/hairstyle-catalog-lineup.ts");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function rowsForCycle({ nearTie = false } = {}) {
  const rows = buildCatalogRowsForCycle("cycle-local-audit", "2026-07-03T00:00:00.000Z", new Map());

  return rows.map((row, index) => ({
    ...row,
    id: `catalog-${String(index).padStart(2, "0")}-${row.slug}`,
    trendScore: nearTie ? 70 : row.trendScore,
    freshnessScore: nearTie ? 70 : row.freshnessScore,
    faceShapeFitTags: nearTie ? ["balanced"] : row.faceShapeFitTags,
    volumeFocusTags: nearTie ? ["balanced"] : row.volumeFocusTags,
  }));
}

function orderedLineupIds(lineups, styleTarget) {
  return lineups
    .filter((lineup) => lineup.style_target === styleTarget)
    .sort((a, b) => a.rank - b.rank)
    .map((lineup) => lineup.catalog_item_id);
}

function assertLineupShape(lineups, styleTarget) {
  const targetLineups = lineups
    .filter((lineup) => lineup.style_target === styleTarget)
    .sort((a, b) => a.rank - b.rank);
  const ids = targetLineups.map((lineup) => lineup.catalog_item_id);
  const slotCounts = targetLineups.reduce((counts, lineup) => {
    counts[lineup.slot_key] = (counts[lineup.slot_key] || 0) + 1;
    return counts;
  }, {});

  assert(targetLineups.length === HAIRSTYLE_CATALOG_LINEUP_SIZE, `${styleTarget} lineup count is not 9`);
  assert(new Set(ids).size === ids.length, `${styleTarget} lineup has duplicate catalog items`);
  assert(
    targetLineups.every((lineup, index) => lineup.rank === index + 1),
    `${styleTarget} lineup ranks are not contiguous`,
  );
  assert(slotCounts.trend === 3, `${styleTarget} trend slot count is not 3`);
  assert(slotCounts.face_fit === 3, `${styleTarget} face_fit slot count is not 3`);
  assert(slotCounts.evergreen === 2, `${styleTarget} evergreen slot count is not 2`);
  assert(slotCounts.experimental === 1, `${styleTarget} experimental slot count is not 1`);
}

const rows = rowsForCycle();
const seedA = "kr:2026-W27:cycle-a";
const sameSeedLineupsA = buildCatalogLineupsForCycle(rows, "cycle-a", seedA);
const sameSeedLineupsB = buildCatalogLineupsForCycle(rows, "cycle-a", seedA);

for (const styleTarget of ["male", "female"]) {
  assertLineupShape(sameSeedLineupsA, styleTarget);
}

assert(
  JSON.stringify(sameSeedLineupsA) === JSON.stringify(sameSeedLineupsB),
  "same rotation seed did not produce a deterministic lineup",
);

const nearTieRows = rowsForCycle({ nearTie: true });
const nearTieSeedA = buildCatalogLineupsForCycle(nearTieRows, "cycle-near", "kr:2026-W27:cycle-a");
const nearTieSeedB = buildCatalogLineupsForCycle(nearTieRows, "cycle-near", "kr:2026-W28:cycle-b");
const changedTargets = ["male", "female"].filter((styleTarget) => {
  const first = orderedLineupIds(nearTieSeedA, styleTarget).join("|");
  const second = orderedLineupIds(nearTieSeedB, styleTarget).join("|");
  return first !== second;
});

assert(changedTargets.length > 0, "different rotation seeds did not change any near-tie lineup order");

console.log(JSON.stringify({
  ok: true,
  lineupSize: HAIRSTYLE_CATALOG_LINEUP_SIZE,
  deterministicTargets: ["male", "female"],
  seedSensitiveTargets: changedTargets,
}, null, 2));
