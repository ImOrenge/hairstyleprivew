import type { PersonalColorProfileV2 } from "../personal-color-v2/contract.ts";
import {
  MAKEUP_MODULES,
  type MakeupContextProfile,
  type MakeupModule,
  type MakeupModuleDirection,
  type MakeupModuleGeometry,
  type MakeupTechnicalDirection,
} from "./contract.ts";

export interface MakeupHairContext {
  colorFamily: string | null;
  fringe: string | null;
  parting: string | null;
}

const PRESENTATION_INTENSITY: Record<MakeupContextProfile["presentation"], number> = {
  invisible_correction: 0.16,
  natural_grooming: 0.28,
  defined: 0.48,
  expressive: 0.7,
  editorial: 0.88,
};

const MODE_INTENSITY: Record<NonNullable<MakeupContextProfile["makeupMode"]>, number> = {
  transparent_correction: 0.16,
  daily_natural: 0.28,
  soft_blend: 0.42,
  full_definition: 0.66,
  glam_event: 0.78,
  fashion_editorial: 0.88,
};

const MODULE_FACTOR: Record<MakeupModule, number> = { base: 0.85, brow: 0.9, eyeshadow: 0.82, eyeliner: 0.75, blush: 0.72, lip: 0.8, lashes: 0.68 };
const PRODUCT_TYPE: Record<MakeupModule, string[]> = {
  base: ["skin_tint", "concealer", "color_corrector"], brow: ["brow_pencil", "brow_powder", "brow_gel"],
  eyeshadow: ["eyeshadow"], eyeliner: ["eyeliner"], blush: ["blush"], lip: ["lip"], lashes: ["mascara", "lash_curler"],
};

const includesAny = (values: string[], candidates: string[]) => candidates.some((candidate) => values.includes(candidate));
const rounded = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
const paletteColor = (profile: PersonalColorProfileV2, module: MakeupModule) => {
  const { best, base, accent } = profile.harmonyPalette;
  if (module === "base") return base[0] ?? best[0] ?? "neutral_skin_family";
  if (module === "brow" || module === "eyeliner" || module === "lashes") return best[0] ?? base[0] ?? "soft_neutral_brown";
  if (module === "eyeshadow") return best[1] ?? best[0] ?? accent[0] ?? "low_chroma_beige";
  return accent[0] ?? best[0] ?? "harmonized_color_family";
};

function productAttributes(module: MakeupModule, context: MakeupContextProfile) {
  const candidates = PRODUCT_TYPE[module];
  const owned = candidates.filter((item) => context.ownedProductTypes.includes(item));
  return owned.length ? owned.map((item) => `owned:${item}`) : candidates.map((item) => `search:${item}`);
}

function complexity(context: MakeupContextProfile) {
  const time = context.preparationMinutes <= 5 ? 0 : context.preparationMinutes <= 10 ? 1 : context.preparationMinutes <= 20 ? 2 : 3;
  const skill = { none: 0, basic: 1, intermediate: 2, advanced: 3 }[context.skillLevel];
  return Math.min(time, skill);
}

function common(input: {
  module: MakeupModule;
  context: MakeupContextProfile;
  placement: string[];
  direction: string[];
  finish: string;
  technique: string;
  parameters: MakeupTechnicalDirection["parameters"];
  warnings?: string[];
}) : MakeupTechnicalDirection {
  return {
    kind: input.module,
    zonePolicyVersion: "makeup-zone-policy-v1",
    placement: input.placement,
    applicationDirection: input.direction,
    finish: input.finish,
    technique: input.technique,
    productAttributes: productAttributes(input.module, input.context),
    warnings: input.warnings ?? [],
    parameters: input.parameters,
  };
}

function technicalDirection(module: MakeupModule, context: MakeupContextProfile, hair: MakeupHairContext): MakeupTechnicalDirection {
  const level = complexity(context);
  const lowTime = context.preparationMinutes <= 5;
  switch (module) {
    case "base": {
      const hasFacialHair = context.facialHair.type !== "none";
      const correction = hasFacialHair && context.facialHair.userWantsCoverage ? "local_peach_or_orange_if_blue_green_cast" : "none";
      return common({ module, context, placement: ["forehead", "t_zone", "under_eye", "nose_side", "around_mouth", "jaw_neck_transition"], direction: ["center_to_outer_thin_layer", "jaw_to_neck_with_residual_product"], finish: context.finishPreference, technique: lowTime ? "spot_correct_then_thin_skin_tint" : "preserve_visible_skin_texture_and_build_only_where_needed", parameters: { coverage: lowTime ? "spot" : level >= 2 ? "light_layered" : "sheer", facialHairType: context.facialHair.type, facialHairTreatment: hasFacialHair ? "avoid_heavy_base_on_hair_mask" : "not_required", localCorrection: correction }, warnings: ["제품 호수는 턱과 목 경계에서 실제 테스트가 필요합니다.", ...(hasFacialHair ? ["수염 경계에는 잔량만 연결하고 질감을 덮지 않습니다."] : [])] });
    }
    case "brow":
      return common({ module, context, placement: ["brow_start", "brow_arch", "brow_tail", "sparse_areas"], direction: ["follow_existing_grain", "start_to_arch_to_tail"], finish: level >= 2 ? "groomed" : "natural_grain", technique: "spot_fill_without_drawing_a_single_solid_block", parameters: { shape: level >= 2 ? "soft_arch" : "straight_soft", thickness: "natural", startDensity: 0.2, centerDensity: rounded(0.38 + level * 0.04), tailDensity: rounded(0.48 + level * 0.04), archPosition: 0.68, tailAngleDegrees: level >= 2 ? -8 : -4, tailLengthRatio: level >= 2 ? 1.08 : 1, relationToHair: "one_level_lighter", hairColorFamily: hair.colorFamily ?? "source_style_color", fringe: hair.fringe ?? "source_style", parting: hair.parting ?? "source_style" } });
    case "eyeshadow": {
      const glitterExcluded = includesAny(context.exclusions, ["glitter", "no_glitter"]);
      const finish = glitterExcluded ? "matte_or_satin" : context.presentation === "editorial" ? "shimmer" : "satin";
      return common({ module, context, placement: ["base_lid", "mid_shade", "outer_depth", ...(level >= 2 ? ["lower_outer_third"] : []), ...(level >= 3 ? ["accent"] : [])], direction: ["lash_line_to_visible_lid", "inner_to_outer_soft_blend"], finish, technique: lowTime ? "single_wash_near_lash_line" : "compress_depth_to_the_visible_lid_area", parameters: { symmetry: "paired_geometry_shared_policy", baseEnabled: true, midEnabled: level >= 1, outerEnabled: level >= 1, lowerEnabled: level >= 2, accentEnabled: level >= 3 && !glitterExcluded, spread: rounded(0.24 + level * 0.08) }, warnings: ["눈을 떴을 때 보이는 면적에 맞춰 영역을 압축합니다."] });
    }
    case "eyeliner": {
      const strongExcluded = includesAny(context.exclusions, ["strong_eyeliner", "no_strong_eyeliner"]);
      return common({ module, context, placement: ["upper_lash_gap", ...(level >= 2 && !strongExcluded ? ["upper_line"] : [])], direction: ["extend_horizontal_flow", "organize_outer_corner_direction"], finish: level >= 2 && !strongExcluded ? "sharp" : "soft", technique: lowTime ? "fill_upper_lash_gaps_only" : "connect_from_middle_to_natural_outer_corner", parameters: { startThickness: 0.08, centerThickness: rounded(0.12 + level * 0.03), tailThickness: rounded(0.08 + level * 0.02), tailLengthRatio: strongExcluded ? 0.04 : rounded(0.05 + level * 0.025), tailAngleDegrees: strongExcluded ? -2 : -6, edge: level >= 2 && !strongExcluded ? "sharp" : "soft" } });
    }
    case "blush":
      return common({ module, context, placement: ["cheek_left", "cheek_right", "outside_pupil_line"], direction: ["cheek_anchor_to_mid_ear", "soft_horizontal_spread"], finish: context.finishPreference === "matte" ? "matte" : context.finishPreference === "glow" ? "glow" : "satin", technique: lowTime ? "one_light_pass" : "diffuse_edges_before_adding_center_color", parameters: { mode: context.presentation === "invisible_correction" ? "vitality" : "visible", spreadX: rounded(0.2 + level * 0.04), spreadY: rounded(0.12 + level * 0.02), angleDegrees: level >= 2 ? -7 : -3 } });
    case "lip":
      return common({ module, context, placement: ["outer_contour", "inner_opening", "cupid_center", "corners", "fill_area"], direction: ["center_to_corner", "preserve_natural_contour"], finish: context.finishPreference === "matte" ? "soft_matte" : context.finishPreference === "glow" ? "gloss" : "satin", technique: lowTime ? "balm_or_low_chroma_tint" : level >= 2 ? "thin_full_lip_then_edge_diffusion" : "tint_with_unemphasized_edge", parameters: { mode: lowTime ? "balm" : level >= 2 ? "full_lip" : "tint", edgeDefinition: rounded(0.18 + level * 0.12), cornerTreatment: "thin_and_clean", selectedHairColorFamily: hair.colorFamily ?? "source_style_color" }, warnings: ["제품명·호수 대신 실제 발색을 확인할 검색 속성을 제공합니다."] });
    case "lashes":
      return common({ module, context, placement: ["upper_inner", "upper_center", "upper_outer", ...(level >= 3 ? ["lower_optional"] : [])], direction: ["inner_up", "center_up", "outer_outward_and_up"], finish: level >= 2 ? "defined" : "natural", technique: lowTime ? "curl_only_or_clear_brown_option" : "root_emphasis_with_segmented_fan", parameters: { curl: rounded(0.32 + level * 0.14), length: level >= 2 ? "extended" : "natural", density: rounded(0.18 + level * 0.16), separation: level >= 2 ? "defined" : "natural", lowerEnabled: level >= 3 } });
  }
}

export function compileMakeupZoneModulesV1(input: {
  context: MakeupContextProfile;
  geometry: Record<MakeupModule, MakeupModuleGeometry>;
  personalColor: PersonalColorProfileV2;
  hair: MakeupHairContext;
  evidenceIds: string[];
}): MakeupModuleDirection[] {
  const baseIntensity = input.context.makeupMode ? MODE_INTENSITY[input.context.makeupMode] : PRESENTATION_INTENSITY[input.context.presentation];
  return MAKEUP_MODULES.map((module) => {
    const explicitlyDisabled = includesAny(input.context.exclusions, [module, `no_${module}`, `exclude_${module}`]);
    const technical = technicalDirection(module, input.context, input.hair);
    return {
      module,
      state: explicitlyDisabled ? "disabled_by_user" : "enabled",
      geometry: input.geometry[module],
      direction: {
        enabled: !explicitlyDisabled,
        intensity: explicitlyDisabled ? 0 : rounded(baseIntensity * MODULE_FACTOR[module]),
        colorFamily: paletteColor(input.personalColor, module),
        texture: technical.finish,
        evidenceIds: input.evidenceIds,
        reasons: [`mode:${input.context.makeupMode ?? input.context.presentation}`, `occasion:${input.context.occasions[0] ?? "not_provided"}`, `finish:${input.context.finishPreference}`, `time:${input.context.preparationMinutes}`, `skill:${input.context.skillLevel}`],
        technical,
      },
    };
  });
}

export function validateMakeupModulePatchBounds(current: MakeupModuleDirection, patch: {
  anchors?: Array<{ index: number; point: { x: number; y: number } }>;
  polygons?: Array<{ polygonIndex: number; pointIndex: number; point: { x: number; y: number } }>;
  vectors?: Array<{ index: number; origin?: { x: number; y: number }; dx?: number; dy?: number }>;
}) {
  const assertPointDelta = (before: { x: number; y: number }, after: { x: number; y: number }) => {
    if (Math.abs(before.x - after.x) > 0.05 || Math.abs(before.y - after.y) > 0.05) throw new Error("MAKEUP_ANCHOR_OUT_OF_BOUNDS");
  };
  for (const item of patch.anchors ?? []) {
    const before = current.geometry.anchors[item.index]; if (!before) throw new Error("MAKEUP_ANCHOR_OUT_OF_BOUNDS"); assertPointDelta(before, item.point);
  }
  for (const item of patch.polygons ?? []) {
    const before = current.geometry.polygons[item.polygonIndex]?.[item.pointIndex]; if (!before) throw new Error("MAKEUP_ANCHOR_OUT_OF_BOUNDS"); assertPointDelta(before, item.point);
  }
  for (const item of patch.vectors ?? []) {
    const before = current.geometry.vectors[item.index]; if (!before) throw new Error("MAKEUP_ANCHOR_OUT_OF_BOUNDS");
    if (item.origin) assertPointDelta(before.origin, item.origin);
    const dx = item.dx ?? before.dx; const dy = item.dy ?? before.dy;
    if (Math.abs(dx - before.dx) > 0.08 || Math.abs(dy - before.dy) > 0.08 || Math.hypot(dx, dy) > 0.35) throw new Error("MAKEUP_ANCHOR_OUT_OF_BOUNDS");
  }
}
