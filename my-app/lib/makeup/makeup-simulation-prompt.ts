export interface MakeupSimulationPromptInput {
  mode: string;
  palette: string[];
  presentationFamily?: "masculine" | "feminine" | "neutral";
  recipeId?: string;
  recipeFingerprint?: string;
  occasion?: string;
  preparationMinutes?: number;
  skillLevel?: string;
  facialHair?: { type: string; userWantsCoverage: boolean };
  modules: Array<{ module: string; color: string; intensity: number; finish: string; enabled?: boolean; paletteRole?: string; techniqueTokens?: string[] }>;
  exclusions: string[];
}

const MAKEUP_TECHNIQUE_PROMPT: Record<string, string> = {
  straight_grain_brow: "keep brow strokes straight and grain-following",
  close_lash_shadow: "keep shadow close to the lash line",
  diffused_lip: "use a softly diffused lip edge",
  soft_arch_brow: "use a soft natural brow arch",
  cheek_gradient: "blend cheek color as a restrained gradient",
  source_structure_brow: "preserve the source brow structure",
  structural_eye_wash: "use a controlled structural eye wash",
  clean_lash_separation: "separate lashes cleanly without changing eye shape",
  skin_texture_preservation: "preserve visible natural skin texture",
  lash_gap_definition: "define only the lash gaps",
  natural_contour_lip: "follow the natural lip contour",
  balanced_complexion: "balance complexion without reshaping or whitening",
};

export function buildOpenAIMakeupStyleSimulationPrompt(input: MakeupSimulationPromptInput) {
  const moduleLines = input.modules.map((item) => {
    const techniques = (item.techniqueTokens ?? []).map((token) => MAKEUP_TECHNIQUE_PROMPT[token]).filter(Boolean).join("; ");
    return `${item.module}: ${item.enabled === false ? "disabled" : "enabled"}, palette role ${item.paletteRole ?? "structured color"}, color ${item.color}, intensity ${item.intensity}%, finish ${item.finish}${techniques ? `, technique ${techniques}` : ""}`;
  }).join("\n");
  return `Create one photorealistic makeup style simulation from the supplied portrait.
Apply makeup only. Preserve the exact same person, facial geometry, eye size, nose, lips, jaw, skin tone, freckles, marks, hair, clothing, background, pose, crop, and lighting intent.
Do not slim or reshape the face, enlarge eyes, reshape the nose, restyle hair, replace the background, whiten skin, erase natural texture, or apply beauty retouching.
The presentation family ${input.presentationFamily ?? "neutral"} controls makeup application conventions only. Never change sex, gender presentation, identity, face, or body.
Validated recipe reference: ${input.recipeId ?? "legacy"}.
Mode: ${input.mode}.
Use occasion ${input.occasion ?? "not provided"}, preparation time ${input.preparationMinutes ?? "not provided"} minutes, and skill level ${input.skillLevel ?? "not provided"} only to control application complexity.
Facial hair condition: ${input.facialHair?.type ?? "not provided"}; coverage requested: ${input.facialHair?.userWantsCoverage ? "yes" : "no"}. Preserve facial-hair boundaries unless coverage was explicitly requested.
Personal color palette: ${input.palette.join(", ") || "use the supplied structured module colors"}.
Structured modules:\n${moduleLines}
Explicit exclusions: ${input.exclusions.join(", ") || "none"}.
Keep realistic pores and product texture. Return a single portrait without text, labels, split panels, or decorative graphics.`;
}
