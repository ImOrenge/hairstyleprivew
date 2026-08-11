import type {
  CatalogSelectionContext,
  CurrentHairProfile,
  HairstyleCatalogLineupRow,
  HairstyleCatalogRow,
  RecommendationLengthBucket,
} from "./recommendation-types";

export interface ScoredCatalogSelection {
  row: HairstyleCatalogRow;
  selectionScore: number;
}

type CatalogRowScore = (row: HairstyleCatalogRow, context: CatalogSelectionContext) => number;

export function hasKnownHairProfile(profile: CurrentHairProfile | null): profile is CurrentHairProfile {
  return Boolean(profile && (
    profile.currentLength !== "unknown" ||
    profile.textureType !== "unknown" ||
    profile.strandThickness !== "unknown" ||
    profile.conditionTags.length > 0 ||
    profile.damageLevel !== "unknown" ||
    profile.desiredLength
  ));
}

export function hasHardHairConflict(row: HairstyleCatalogRow, profile: CurrentHairProfile | null): boolean {
  if (!hasKnownHairProfile(profile) || profile.source === "image_estimate") {
    return false;
  }

  if (profile.textureType !== "unknown" && row.avoidTextureTags.includes(profile.textureType)) {
    return true;
  }
  if (profile.strandThickness !== "unknown" && row.avoidStrandThicknessTags.includes(profile.strandThickness)) {
    return true;
  }
  if (profile.conditionTags.some((condition) => row.avoidConditionTags.includes(condition))) {
    return true;
  }

  return profile.damageLevel === "high" && (
    row.requiredServices.includes("bleach") ||
    row.requiredServices.includes("straightening") ||
    row.requiredServices.includes("perm")
  );
}

export function isTextureAndThicknessCompatible(row: HairstyleCatalogRow, profile: CurrentHairProfile): boolean {
  const textureCompatible = profile.textureType === "unknown" ||
    row.primaryTexture === profile.textureType ||
    row.compatibleTextureTags.includes(profile.textureType);
  const thicknessCompatible = profile.strandThickness === "unknown" ||
    row.primaryStrandThickness === profile.strandThickness ||
    row.compatibleStrandThicknessTags.includes(profile.strandThickness);
  return textureCompatible && thicknessCompatible;
}

function buildLengthQuotas(
  context: CatalogSelectionContext,
  limit: number,
): Record<RecommendationLengthBucket, number> {
  const desired = context.hairProfile?.desiredLength;
  if (desired && limit === 9) {
    const adjacent: RecommendationLengthBucket = desired === "short" ? "medium" : desired === "long" ? "medium" : "long";
    const exploration = (["short", "medium", "long"] as const).find((bucket) => bucket !== desired && bucket !== adjacent) || "short";
    return { short: 0, medium: 0, long: 0, [desired]: 6, [adjacent]: 2, [exploration]: 1 };
  }
  if (desired && limit === 6) {
    const adjacent: RecommendationLengthBucket = desired === "short" ? "medium" : desired === "long" ? "medium" : "long";
    const exploration = (["short", "medium", "long"] as const).find((bucket) => bucket !== desired && bucket !== adjacent) || "short";
    return { short: 0, medium: 0, long: 0, [desired]: 4, [adjacent]: 1, [exploration]: 1 };
  }

  const base = Math.floor(limit / 3);
  const remainder = limit % 3;
  return {
    short: base + (remainder > 0 ? 1 : 0),
    medium: base + (remainder > 1 ? 1 : 0),
    long: base,
  };
}

function selectTopRows(
  rows: HairstyleCatalogRow[],
  context: CatalogSelectionContext,
  scoreRow: CatalogRowScore,
  excludedCatalogItemIds = new Set<string>(),
  limit = 9,
): ScoredCatalogSelection[] {
  if (limit <= 0) {
    return [];
  }

  const scored = rows
    .filter((row) => !hasHardHairConflict(row, context.hairProfile))
    .map((row) => ({ row, selectionScore: scoreRow(row, context) }))
    .sort((a, b) => b.selectionScore - a.selectionScore);
  const selected: ScoredCatalogSelection[] = [];
  const picked = new Set<string>(excludedCatalogItemIds);
  const familyCounts = new Map<string, number>();
  const quotas = buildLengthQuotas(context, limit);

  for (const bucket of ["short", "medium", "long"] as const) {
    while (selected.filter((item) => item.row.lengthBucket === bucket).length < quotas[bucket]) {
      const match = scored.find((item) =>
        item.row.lengthBucket === bucket &&
        !picked.has(item.row.id) &&
        (familyCounts.get(item.row.styleFamily) || 0) < 2
      );
      if (!match) break;
      selected.push(match);
      picked.add(match.row.id);
      familyCounts.set(match.row.styleFamily, (familyCounts.get(match.row.styleFamily) || 0) + 1);
    }
  }

  for (const item of scored) {
    if (selected.length >= limit) break;
    if (picked.has(item.row.id) || (familyCounts.get(item.row.styleFamily) || 0) >= 2) continue;
    selected.push(item);
    picked.add(item.row.id);
    familyCounts.set(item.row.styleFamily, (familyCounts.get(item.row.styleFamily) || 0) + 1);
  }

  return selected.slice(0, limit);
}

export function selectLineupBackedCatalogRows(
  rows: HairstyleCatalogRow[],
  lineups: HairstyleCatalogLineupRow[],
  context: CatalogSelectionContext,
  scoreRow: CatalogRowScore,
): ScoredCatalogSelection[] {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const hairProfile = context.hairProfile;

  if (hasKnownHairProfile(hairProfile)) {
    const eligibleRows = rows.filter((row) => !hasHardHairConflict(row, hairProfile));
    const compatibleRows = eligibleRows.filter((row) => isTextureAndThicknessCompatible(row, hairProfile));
    const personalized = selectTopRows(compatibleRows, context, scoreRow, new Set(), 6);
    const picked = new Set(personalized.map((item) => item.row.id));
    const lineupMix: ScoredCatalogSelection[] = [];
    const finalQuotas = buildLengthQuotas(context, 9);
    const lengthCounts = new Map<RecommendationLengthBucket, number>(
      (["short", "medium", "long"] as const).map((bucket) => [bucket, personalized.filter((item) => item.row.lengthBucket === bucket).length]),
    );
    const familyCounts = new Map<string, number>();
    for (const item of personalized) {
      familyCounts.set(item.row.styleFamily, (familyCounts.get(item.row.styleFamily) || 0) + 1);
    }

    for (const lineup of lineups
      .filter((item) => item.styleTarget === context.styleTarget)
      .sort((a, b) => a.rank - b.rank)) {
      if (lineupMix.length >= 3) break;
      const row = rowsById.get(lineup.catalogItemId);
      if (
        !row || picked.has(row.id) || hasHardHairConflict(row, hairProfile) ||
        (lengthCounts.get(row.lengthBucket) || 0) >= finalQuotas[row.lengthBucket] ||
        (familyCounts.get(row.styleFamily) || 0) >= 2
      ) continue;
      lineupMix.push({
        row,
        selectionScore: Math.round((lineup.rotationScore + scoreRow(row, context)) * 100) / 100,
      });
      picked.add(row.id);
      lengthCounts.set(row.lengthBucket, (lengthCounts.get(row.lengthBucket) || 0) + 1);
      familyCounts.set(row.styleFamily, (familyCounts.get(row.styleFamily) || 0) + 1);
    }

    const selected = [...personalized, ...lineupMix];
    if (selected.length < 9) {
      const fillers = eligibleRows
        .filter((row) => !picked.has(row.id))
        .sort((a, b) => scoreRow(b, context) - scoreRow(a, context));
      for (const bucket of ["short", "medium", "long"] as const) {
        while ((lengthCounts.get(bucket) || 0) < finalQuotas[bucket] && selected.length < 9) {
          const row = fillers.find((candidate) =>
            candidate.lengthBucket === bucket &&
            !picked.has(candidate.id) &&
            (familyCounts.get(candidate.styleFamily) || 0) < 2
          );
          if (!row) break;
          selected.push({ row, selectionScore: scoreRow(row, context) });
          picked.add(row.id);
          lengthCounts.set(bucket, (lengthCounts.get(bucket) || 0) + 1);
          familyCounts.set(row.styleFamily, (familyCounts.get(row.styleFamily) || 0) + 1);
        }
      }
    }
    return selected.slice(0, 9);
  }

  const selected: ScoredCatalogSelection[] = [];
  const picked = new Set<string>();
  const defaultQuotas = buildLengthQuotas(context, 9);
  const lengthCounts = new Map<RecommendationLengthBucket, number>([["short", 0], ["medium", 0], ["long", 0]]);
  const familyCounts = new Map<string, number>();

  for (const lineup of lineups
    .filter((item) => item.styleTarget === context.styleTarget)
    .sort((a, b) => a.rank - b.rank)) {
    if (selected.length >= 9) break;
    const row = rowsById.get(lineup.catalogItemId);
    if (
      !row || picked.has(row.id) || !row.styleTargets.includes(context.styleTarget) ||
      (lengthCounts.get(row.lengthBucket) || 0) >= defaultQuotas[row.lengthBucket] ||
      (familyCounts.get(row.styleFamily) || 0) >= 2
    ) continue;
    selected.push({
      row,
      selectionScore: Math.round((lineup.rotationScore + scoreRow(row, context)) * 100) / 100,
    });
    picked.add(row.id);
    lengthCounts.set(row.lengthBucket, (lengthCounts.get(row.lengthBucket) || 0) + 1);
    familyCounts.set(row.styleFamily, (familyCounts.get(row.styleFamily) || 0) + 1);
  }

  if (selected.length >= 9) return selected;

  const fillers = rows
    .filter((row) => !picked.has(row.id) && !hasHardHairConflict(row, context.hairProfile))
    .sort((a, b) => scoreRow(b, context) - scoreRow(a, context));
  for (const bucket of ["short", "medium", "long"] as const) {
    while ((lengthCounts.get(bucket) || 0) < defaultQuotas[bucket] && selected.length < 9) {
      const row = fillers.find((candidate) =>
        candidate.lengthBucket === bucket &&
        !picked.has(candidate.id) &&
        (familyCounts.get(candidate.styleFamily) || 0) < 2
      );
      if (!row) break;
      selected.push({ row, selectionScore: scoreRow(row, context) });
      picked.add(row.id);
      lengthCounts.set(bucket, (lengthCounts.get(bucket) || 0) + 1);
      familyCounts.set(row.styleFamily, (familyCounts.get(row.styleFamily) || 0) + 1);
    }
  }
  return selected.slice(0, 9);
}
