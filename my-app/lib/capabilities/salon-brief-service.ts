import "server-only";

import type { CapabilityResult } from "@hairfit/shared/consulting/capability";
import { generateDesignerBriefs } from "../designer-brief-generator";
import { runDurableCapability } from "./durable-runtime";
import { HAIRFIT_LEGACY_SOURCE_REVISION, runInlineCapability, type CapabilityEngineAdapter } from "./runtime";

type SalonBriefInput = Parameters<typeof generateDesignerBriefs>[0];
type SalonBriefOutput = Awaited<ReturnType<typeof generateDesignerBriefs>>;
const adapter: CapabilityEngineAdapter<SalonBriefInput, SalonBriefOutput> = {
  capability: "salon-brief-generation",
  engineVersion: "legacy-designer-brief-v1",
  sourceRevision: HAIRFIT_LEGACY_SOURCE_REVISION,
  provider: process.env.GOOGLE_API_KEY ? "gemini" : null,
  model: process.env.PROMPT_LLM_MODEL || process.env.PROMPT_RESEARCH_MODEL || "gemini-2.5-flash",
  promptPolicyVersion: "designer-brief-v1",
  catalogCycleId: null,
  fallbackMode: process.env.GOOGLE_API_KEY ? "none" : "deterministic",
  execute: generateDesignerBriefs,
  failureCode: () => "SALON_BRIEF_GENERATION_FAILED",
  failureMessage: () => "살롱 브리프를 준비하지 못했습니다. 저장된 선택은 유지됩니다.",
};

export function runSalonBriefCapability(input: { userId?: string; consultationId: string; idempotencyKey: string; briefInput: SalonBriefInput }): Promise<CapabilityResult<SalonBriefOutput>> {
  const execution = { consultationId: input.consultationId, idempotencyKey: input.idempotencyKey, input: input.briefInput };
  return input.userId ? runDurableCapability(adapter, { ...execution, userId: input.userId }) : runInlineCapability(adapter, execution);
}
