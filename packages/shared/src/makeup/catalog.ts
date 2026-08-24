import { MAKEUP_MODULES, type MakeupContextProfile, type MakeupModule, type MakeupModuleDirection } from "./contract.ts";
import { MAKEUP_MODES, type MakeupMode } from "./interview.ts";

export const MAKEUP_PRESENTATION_FAMILIES = ["masculine", "feminine", "neutral"] as const;
export type MakeupPresentationFamilyV1 = (typeof MAKEUP_PRESENTATION_FAMILIES)[number];

export const MAKEUP_RECIPE_TECHNIQUE_TOKENS = [
  "straight_grain_brow", "close_lash_shadow", "diffused_lip", "soft_arch_brow",
  "cheek_gradient", "source_structure_brow", "structural_eye_wash", "clean_lash_separation",
  "skin_texture_preservation", "lash_gap_definition", "natural_contour_lip", "balanced_complexion",
] as const;
export type MakeupRecipeTechniqueTokenV1 = (typeof MAKEUP_RECIPE_TECHNIQUE_TOKENS)[number];

export const MAKEUP_RECIPE_PALETTE_ROLES = [
  "skin_base", "brow_neutral", "eye_harmony", "eye_definition", "cheek_accent", "lip_accent", "lash_neutral",
] as const;
export type MakeupRecipePaletteRoleV1 = (typeof MAKEUP_RECIPE_PALETTE_ROLES)[number];

export interface MakeupRecipeModulePolicyV1 {
  module: MakeupModule;
  defaultEnabled: boolean;
  intensityMultiplier: number;
  paletteRole: MakeupRecipePaletteRoleV1;
  finishPolicy: "customer" | "natural" | "satin" | "soft_matte" | "defined";
  techniqueTokens: MakeupRecipeTechniqueTokenV1[];
}

export interface MakeupRecipeV1 {
  schemaVersion: "makeup-recipe-v1";
  id: string;
  cycleId: string;
  cycleVersion: number;
  presentationFamily: MakeupPresentationFamilyV1;
  mode: MakeupMode;
  modules: MakeupRecipeModulePolicyV1[];
  fingerprint: string;
}

export interface MakeupRecipeCatalogCycleV1 {
  schemaVersion: "makeup-recipe-catalog-cycle-v1";
  id: string;
  version: number;
  status: "draft" | "validated" | "active" | "retired";
  fingerprint: string;
  validation: { valid: boolean; errors: string[]; entryCount: number };
  activatedAt: string | null;
  createdAt: string;
}

export interface MakeupRecipeBindingV1 {
  cycleId: string;
  cycleVersion: number;
  recipeId: string;
  recipeFingerprint: string;
  presentationFamily: MakeupPresentationFamilyV1;
}

const COLOR_VISIBLE_MODES = new Set<MakeupMode>(["soft_blend", "full_definition", "glam_event", "fashion_editorial"]);
const PALETTE_ROLE_BY_MODULE: Record<MakeupModule, MakeupRecipePaletteRoleV1> = {
  base: "skin_base", brow: "brow_neutral", eyeshadow: "eye_harmony", eyeliner: "eye_definition",
  blush: "cheek_accent", lip: "lip_accent", lashes: "lash_neutral",
};

export function presentationFamilyFromGender(gender: string | null | undefined): MakeupPresentationFamilyV1 {
  if (gender === "male") return "masculine";
  if (gender === "female") return "feminine";
  return "neutral";
}

export function assertMakeupRecipeV1(recipe: MakeupRecipeV1) {
  if (recipe.schemaVersion !== "makeup-recipe-v1" || !recipe.id || !recipe.cycleId
    || !Number.isInteger(recipe.cycleVersion) || recipe.cycleVersion < 1
    || !MAKEUP_PRESENTATION_FAMILIES.includes(recipe.presentationFamily)
    || !MAKEUP_MODES.includes(recipe.mode) || !/^[a-f0-9]{64}$/i.test(recipe.fingerprint)) {
    throw new Error("MAKEUP_RECIPE_IDENTITY_INVALID");
  }
  const modules = new Set(recipe.modules.map((item) => item.module));
  if (recipe.modules.length !== MAKEUP_MODULES.length || modules.size !== MAKEUP_MODULES.length
    || MAKEUP_MODULES.some((module) => !modules.has(module))) throw new Error("MAKEUP_RECIPE_MODULES_INVALID");
  for (const item of recipe.modules) {
    if (!Number.isFinite(item.intensityMultiplier) || item.intensityMultiplier < 0 || item.intensityMultiplier > 1.25
      || !MAKEUP_RECIPE_PALETTE_ROLES.includes(item.paletteRole)
      || item.techniqueTokens.some((token) => !MAKEUP_RECIPE_TECHNIQUE_TOKENS.includes(token))) {
      throw new Error("MAKEUP_RECIPE_POLICY_INVALID");
    }
  }
}

export function validateMakeupRecipeCatalogV1(recipes: MakeupRecipeV1[]) {
  const errors: string[] = [];
  const keys = new Set<string>();
  for (const recipe of recipes) {
    try { assertMakeupRecipeV1(recipe); } catch (error) { errors.push(error instanceof Error ? error.message : "MAKEUP_RECIPE_INVALID"); }
    const key = `${recipe.presentationFamily}:${recipe.mode}`;
    if (keys.has(key)) errors.push(`MAKEUP_RECIPE_DUPLICATE:${key}`);
    keys.add(key);
  }
  for (const family of MAKEUP_PRESENTATION_FAMILIES) for (const mode of MAKEUP_MODES) {
    if (!keys.has(`${family}:${mode}`)) errors.push(`MAKEUP_RECIPE_MISSING:${family}:${mode}`);
  }
  if (recipes.length !== MAKEUP_PRESENTATION_FAMILIES.length * MAKEUP_MODES.length) errors.push("MAKEUP_RECIPE_ENTRY_COUNT_INVALID");
  return { valid: errors.length === 0, errors: [...new Set(errors)], entryCount: recipes.length };
}

export function applyMakeupRecipeV1(modules: MakeupModuleDirection[], recipe: MakeupRecipeV1) {
  assertMakeupRecipeV1(recipe);
  return modules.map((module) => {
    const policy = recipe.modules.find((item) => item.module === module.module)!;
    const disabledByUser = module.state === "disabled_by_user";
    const enabled = !disabledByUser && policy.defaultEnabled;
    const multiplier = COLOR_VISIBLE_MODES.has(recipe.mode) ? Math.max(0.9, policy.intensityMultiplier) : policy.intensityMultiplier;
    const finish = policy.finishPolicy === "customer" ? module.direction.texture : policy.finishPolicy;
    return {
      ...module,
      state: disabledByUser ? "disabled_by_user" as const : enabled ? "enabled" as const : "not_applicable" as const,
      direction: {
        ...module.direction,
        enabled,
        intensity: enabled ? Math.round(module.direction.intensity * multiplier * 100) / 100 : 0,
        texture: finish,
        reasons: [...module.direction.reasons, `recipe:${recipe.id}`, `presentation:${recipe.presentationFamily}`, `palette-role:${policy.paletteRole}`],
        technical: {
          ...module.direction.technical,
          finish: finish ?? module.direction.technical.finish,
          technique: policy.techniqueTokens.join("+") || module.direction.technical.technique,
          parameters: { ...module.direction.technical.parameters, recipePaletteRole: policy.paletteRole, recipeTechniqueTokens: policy.techniqueTokens },
        },
      },
    };
  });
}

export function applyMakeupPracticalityV1(modules: MakeupModuleDirection[], context: MakeupContextProfile) {
  const compact = context.preparationMinutes <= 5 || context.skillLevel === "none";
  if (!compact) return modules;
  return modules.map((module) => {
    if (!module.direction.enabled) return module;
    const rawTokens = module.direction.technical.parameters.recipeTechniqueTokens;
    const techniqueTokens = Array.isArray(rawTokens) ? rawTokens.slice(0, 1) : rawTokens;
    return {
      ...module,
      direction: {
        ...module.direction,
        intensity: Math.round(module.direction.intensity * 0.85 * 100) / 100,
        reasons: [...module.direction.reasons, "practicality:compact_application"],
        technical: {
          ...module.direction.technical,
          parameters: { ...module.direction.technical.parameters, recipeTechniqueTokens: techniqueTokens, practicalComplexity: "compact" },
        },
      },
    };
  });
}

const DAILY_ENABLED: Record<MakeupPresentationFamilyV1, readonly MakeupModule[]> = {
  masculine: ["base", "brow", "eyeshadow", "blush", "lip"],
  feminine: MAKEUP_MODULES,
  neutral: ["base", "brow", "eyeshadow", "eyeliner", "blush", "lip"],
};

const TRANSPARENT_ENABLED: Record<MakeupPresentationFamilyV1, readonly MakeupModule[]> = {
  masculine: ["base", "brow", "lip"],
  feminine: ["base", "brow", "blush", "lip"],
  neutral: ["base", "brow", "lip"],
};

const FAMILY_MULTIPLIERS: Record<MakeupPresentationFamilyV1, Record<MakeupModule, number>> = {
  masculine: { base: 1, brow: 1.05, eyeshadow: 0.55, eyeliner: 0.65, blush: 0.55, lip: 0.65, lashes: 0.55 },
  feminine: { base: 1, brow: 1, eyeshadow: 1, eyeliner: 1, blush: 1, lip: 1, lashes: 1 },
  neutral: { base: 1, brow: 1, eyeshadow: 0.75, eyeliner: 0.8, blush: 0.75, lip: 0.8, lashes: 0.75 },
};

const TECHNIQUE_BY_FAMILY: Record<MakeupPresentationFamilyV1, Partial<Record<MakeupModule, MakeupRecipeTechniqueTokenV1[]>>> = {
  masculine: {
    base: ["skin_texture_preservation", "balanced_complexion"],
    brow: ["straight_grain_brow", "source_structure_brow"],
    eyeshadow: ["close_lash_shadow"],
    eyeliner: ["lash_gap_definition"],
    blush: ["cheek_gradient"],
    lip: ["diffused_lip", "natural_contour_lip"],
    lashes: ["clean_lash_separation"],
  },
  feminine: {
    base: ["skin_texture_preservation", "balanced_complexion"],
    brow: ["soft_arch_brow", "source_structure_brow"],
    eyeshadow: ["structural_eye_wash"],
    eyeliner: ["lash_gap_definition"],
    blush: ["cheek_gradient"],
    lip: ["diffused_lip", "natural_contour_lip"],
    lashes: ["clean_lash_separation"],
  },
  neutral: {
    base: ["skin_texture_preservation", "balanced_complexion"],
    brow: ["source_structure_brow"],
    eyeshadow: ["structural_eye_wash"],
    eyeliner: ["lash_gap_definition"],
    blush: ["cheek_gradient"],
    lip: ["diffused_lip", "natural_contour_lip"],
    lashes: ["clean_lash_separation"],
  },
};

export function seedMakeupRecipeModulesV1(
  presentationFamily: MakeupPresentationFamilyV1,
  mode: MakeupMode,
): MakeupRecipeModulePolicyV1[] {
  const visible = COLOR_VISIBLE_MODES.has(mode);
  const enabled = visible
    ? MAKEUP_MODULES
    : mode === "daily_natural"
      ? DAILY_ENABLED[presentationFamily]
      : TRANSPARENT_ENABLED[presentationFamily];
  return MAKEUP_MODULES.map((module) => ({
    module,
    defaultEnabled: enabled.includes(module),
    intensityMultiplier: visible ? Math.max(0.9, FAMILY_MULTIPLIERS[presentationFamily][module]) : FAMILY_MULTIPLIERS[presentationFamily][module],
    paletteRole: PALETTE_ROLE_BY_MODULE[module],
    finishPolicy: "customer",
    techniqueTokens: [...(TECHNIQUE_BY_FAMILY[presentationFamily][module] ?? [])],
  }));
}
