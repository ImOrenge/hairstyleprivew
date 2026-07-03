import type { HairstyleCatalogLineupRow, HairstyleCatalogRow, MemberStyleTarget } from "./recommendation-types";

export type CatalogLineupSlotKey = "trend" | "face_fit" | "evergreen" | "experimental";

export interface CatalogLineupInsert {
  cycle_id: string;
  market: string;
  style_target: MemberStyleTarget;
  slot_key: CatalogLineupSlotKey;
  rank: number;
  catalog_item_id: string;
  rotation_score: number;
  selection_reason: string;
}

export const HAIRSTYLE_CATALOG_LINEUP_SIZE = 9;

function hashToUnitInterval(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
}

function rotationBias(rotationSeed: string, row: HairstyleCatalogRow, styleTarget: MemberStyleTarget) {
  return hashToUnitInterval(`${rotationSeed}:${styleTarget}:${row.slug}`);
}

function scoreLineupCandidate(
  row: HairstyleCatalogRow,
  slotKey: CatalogLineupSlotKey,
  rotationSeed: string,
  styleTarget: MemberStyleTarget,
) {
  const bias = rotationBias(rotationSeed, row, styleTarget) * 10;
  const baseScore = row.trendScore * 0.45 + row.freshnessScore * 0.35 + bias;

  if (slotKey === "trend") {
    return baseScore + row.trendScore * 0.25;
  }

  if (slotKey === "face_fit") {
    return baseScore + row.faceShapeFitTags.length * 4 + row.volumeFocusTags.length * 3;
  }

  if (slotKey === "experimental") {
    return baseScore + bias * 2;
  }

  return baseScore + (100 - Math.abs(70 - row.trendScore)) * 0.08;
}

function buildLineupForStyleTarget(
  rows: HairstyleCatalogRow[],
  cycleId: string,
  rotationSeed: string,
  styleTarget: MemberStyleTarget,
): CatalogLineupInsert[] {
  const targetRows = rows.filter((row) => row.styleTargets.includes(styleTarget));
  const picked = new Set<string>();
  const lineup: CatalogLineupInsert[] = [];
  const slotPlan: Array<{ slotKey: CatalogLineupSlotKey; count: number }> = [
    { slotKey: "trend", count: 3 },
    { slotKey: "face_fit", count: 3 },
    { slotKey: "evergreen", count: 2 },
    { slotKey: "experimental", count: 1 },
  ];

  for (const { slotKey, count } of slotPlan) {
    const candidates = targetRows
      .filter((row) => !picked.has(row.id))
      .sort((a, b) =>
        scoreLineupCandidate(b, slotKey, rotationSeed, styleTarget) -
        scoreLineupCandidate(a, slotKey, rotationSeed, styleTarget),
      );

    for (const row of candidates.slice(0, count)) {
      picked.add(row.id);
      lineup.push({
        cycle_id: cycleId,
        market: row.market,
        style_target: styleTarget,
        slot_key: slotKey,
        rank: lineup.length + 1,
        catalog_item_id: row.id,
        rotation_score: Math.round(scoreLineupCandidate(row, slotKey, rotationSeed, styleTarget) * 100) / 100,
        selection_reason: `${slotKey} slot selected by rotation seed ${rotationSeed}`,
      });
    }
  }

  if (lineup.length < HAIRSTYLE_CATALOG_LINEUP_SIZE) {
    const fillers = targetRows
      .filter((row) => !picked.has(row.id))
      .sort((a, b) =>
        scoreLineupCandidate(b, "trend", rotationSeed, styleTarget) -
        scoreLineupCandidate(a, "trend", rotationSeed, styleTarget),
      );

    for (const row of fillers) {
      if (lineup.length >= HAIRSTYLE_CATALOG_LINEUP_SIZE) {
        break;
      }

      picked.add(row.id);
      lineup.push({
        cycle_id: cycleId,
        market: row.market,
        style_target: styleTarget,
        slot_key: "trend",
        rank: lineup.length + 1,
        catalog_item_id: row.id,
        rotation_score: Math.round(scoreLineupCandidate(row, "trend", rotationSeed, styleTarget) * 100) / 100,
        selection_reason: `fill slot selected by rotation seed ${rotationSeed}`,
      });
    }
  }

  return lineup.slice(0, HAIRSTYLE_CATALOG_LINEUP_SIZE);
}

export function buildCatalogLineupsForCycle(rows: HairstyleCatalogRow[], cycleId: string, rotationSeed: string) {
  return [
    ...buildLineupForStyleTarget(rows, cycleId, rotationSeed, "male"),
    ...buildLineupForStyleTarget(rows, cycleId, rotationSeed, "female"),
  ];
}

export function computeLineupOverlap(
  previousRows: HairstyleCatalogRow[],
  previousLineups: HairstyleCatalogLineupRow[],
  nextRows: HairstyleCatalogRow[],
  nextLineups: CatalogLineupInsert[],
) {
  const previousSlugById = new Map(previousRows.map((row) => [row.id, row.slug]));
  const nextSlugById = new Map(nextRows.map((row) => [row.id, row.slug]));

  return (["male", "female"] as const).map((styleTarget) => {
    const previousSlugs = new Set(
      previousLineups
        .filter((lineup) => lineup.styleTarget === styleTarget)
        .sort((a, b) => a.rank - b.rank)
        .slice(0, HAIRSTYLE_CATALOG_LINEUP_SIZE)
        .map((lineup) => previousSlugById.get(lineup.catalogItemId))
        .filter((slug): slug is string => Boolean(slug)),
    );
    const nextSlugs = nextLineups
      .filter((lineup) => lineup.style_target === styleTarget)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, HAIRSTYLE_CATALOG_LINEUP_SIZE)
      .map((lineup) => nextSlugById.get(lineup.catalog_item_id))
      .filter((slug): slug is string => Boolean(slug));
    const overlapSlugs = nextSlugs.filter((slug) => previousSlugs.has(slug));

    return {
      styleTarget,
      overlapCount: overlapSlugs.length,
      overlapSlugs,
      previousCount: previousSlugs.size,
      nextCount: nextSlugs.length,
    };
  });
}
