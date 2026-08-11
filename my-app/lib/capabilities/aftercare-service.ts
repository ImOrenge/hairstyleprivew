import "server-only";

import type { CapabilityResult } from "@hairfit/shared/consulting/capability";
import { generateAftercareGuide, type AftercareGuide, type GenerateAftercareGuideInput } from "../aftercare-guide-generator";
import { getAftercareLlmModel } from "../aftercare-model";
import { runDurableCapability } from "./durable-runtime";
import { HAIRFIT_LEGACY_SOURCE_REVISION, runInlineCapability, type CapabilityEngineAdapter } from "./runtime";

const adapter: CapabilityEngineAdapter<GenerateAftercareGuideInput, AftercareGuide> = {
  capability: "aftercare-program-generation",
  engineVersion: "legacy-aftercare-guide-v1",
  sourceRevision: HAIRFIT_LEGACY_SOURCE_REVISION,
  provider: process.env.GOOGLE_API_KEY ? "gemini" : null,
  model: getAftercareLlmModel(),
  promptPolicyVersion: "aftercare-actual-service-v1",
  catalogCycleId: null,
  fallbackMode: process.env.GOOGLE_API_KEY ? "none" : "deterministic",
  execute: generateAftercareGuide,
  failureCode: () => "AFTERCARE_PROGRAM_GENERATION_FAILED",
  failureMessage: () => "시술 후 관리 프로그램을 준비하지 못했습니다. 실제 시술 기록은 유지됩니다.",
};

export function runAftercareCapability(input: { userId?: string; consultationId: string; idempotencyKey: string; aftercareInput: GenerateAftercareGuideInput }): Promise<CapabilityResult<AftercareGuide>> {
  const execution = { consultationId: input.consultationId, idempotencyKey: input.idempotencyKey, input: input.aftercareInput };
  return input.userId ? runDurableCapability(adapter, { ...execution, userId: input.userId }) : runInlineCapability(adapter, execution);
}
