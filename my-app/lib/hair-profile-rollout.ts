import type {
  CurrentHairProfile,
  HairProfilePersonalizationRolloutDecision,
} from "./recommendation-types";

type RolloutEnvironment = Partial<Record<string, string | undefined>>;

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

function hasKnownProfile(profile: CurrentHairProfile | null) {
  return Boolean(profile && (
    profile.currentLength !== "unknown" ||
    profile.textureType !== "unknown" ||
    profile.strandThickness !== "unknown" ||
    profile.conditionTags.length > 0 ||
    profile.damageLevel !== "unknown" ||
    profile.desiredLength
  ));
}

function internalUserIds(value: string | undefined) {
  return new Set(
    (value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function rolloutPercentage(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.floor(parsed)));
}

export function stableHairProfileRolloutBucket(userId: string) {
  let hash = 2166136261;
  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

export function buildHairProfileRolloutDecision(
  userId: string,
  hairProfile: CurrentHairProfile | null,
  environment: RolloutEnvironment = process.env,
): HairProfilePersonalizationRolloutDecision {
  const bucket = stableHairProfileRolloutBucket(userId);
  const percentage = rolloutPercentage(environment.HAIR_PROFILE_MATCHING_V2_ROLLOUT_PERCENT);

  if (!enabled(environment.HAIR_PROFILE_MATCHING_V2_ENABLED)) {
    return { mode: "off", reason: "master_flag_off", bucket, rolloutPercentage: percentage };
  }
  if (!hasKnownProfile(hairProfile)) {
    return { mode: "off", reason: "profile_unknown", bucket, rolloutPercentage: percentage };
  }

  const configuredMode = environment.HAIR_PROFILE_MATCHING_V2_MODE?.trim().toLowerCase() || "shadow";
  if (configuredMode === "off") {
    return { mode: "off", reason: "mode_off", bucket, rolloutPercentage: percentage };
  }
  if (configuredMode === "shadow") {
    return { mode: "shadow", reason: "shadow", bucket, rolloutPercentage: percentage };
  }
  if (configuredMode !== "live") {
    return { mode: "off", reason: "invalid_mode", bucket, rolloutPercentage: percentage };
  }

  if (internalUserIds(environment.HAIR_PROFILE_MATCHING_V2_INTERNAL_USER_IDS).has(userId)) {
    return { mode: "live", reason: "internal_allowlist", bucket, rolloutPercentage: percentage };
  }
  if (bucket < percentage) {
    return { mode: "live", reason: "percentage_canary", bucket, rolloutPercentage: percentage };
  }
  return { mode: "shadow", reason: "percentage_control", bucket, rolloutPercentage: percentage };
}
