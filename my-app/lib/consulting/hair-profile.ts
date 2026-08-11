import type { CurrentHairProfile, HairConditionTag } from "../recommendation-types";
import type { ConsultationInputProfile, StrategySnapshot } from "./contracts";

type DiscoveryHairInputs = Pick<
  ConsultationInputProfile,
  "currentHair" | "hairLength" | "strandThickness" | "hairTexture" | "damageLevel" | "treatmentHistory"
>;

type StrategyHairInputs = Pick<StrategySnapshot, "length">;

const LENGTHS: Record<string, CurrentHairProfile["currentLength"]> = {
  "짧음": "short",
  "중간": "medium",
  "김": "long",
};

const TEXTURES: Record<string, CurrentHairProfile["textureType"]> = {
  "직모": "straight",
  "약한 웨이브": "wavy_curly",
  "곱슬": "tight_curly_frizzy",
};

const THICKNESSES: Record<string, CurrentHairProfile["strandThickness"]> = {
  "가늘음": "fine",
  "보통": "medium",
  "굵음": "coarse",
};

const DAMAGE_LEVELS: Record<string, CurrentHairProfile["damageLevel"]> = {
  "낮음": "low",
  "보통": "medium",
  "높음": "high",
};

const DESIRED_LENGTHS = new Set(["short", "medium", "long"] as const);

function conditionTags(discovery: DiscoveryHairInputs): HairConditionTag[] {
  const tags = new Set<HairConditionTag>();
  for (const treatment of discovery.treatmentHistory) {
    if (treatment === "탈색") tags.add("bleached");
    if (treatment === "염색") tags.add("colored");
    if (treatment === "펌") tags.add("permed");
    if (treatment === "매직·스트레이트") tags.add("damaged");
  }
  if (discovery.damageLevel === "보통" || discovery.damageLevel === "높음") tags.add("damaged");
  if (/극손상|심한\s*손상|끊어짐/.test(discovery.currentHair)) tags.add("severely_damaged");
  if (tags.size === 0) tags.add("untreated");
  return [...tags];
}

export function buildConsultationHairProfile(
  discovery: DiscoveryHairInputs,
  strategy: StrategyHairInputs,
): CurrentHairProfile {
  return {
    currentLength: LENGTHS[discovery.hairLength] ?? "unknown",
    textureType: TEXTURES[discovery.hairTexture] ?? "unknown",
    strandThickness: THICKNESSES[discovery.strandThickness] ?? "unknown",
    conditionTags: conditionTags(discovery),
    damageLevel: DAMAGE_LEVELS[discovery.damageLevel] ?? "unknown",
    desiredLength: DESIRED_LENGTHS.has(strategy.length as "short" | "medium" | "long")
      ? strategy.length as "short" | "medium" | "long"
      : null,
    source: "user",
  };
}
