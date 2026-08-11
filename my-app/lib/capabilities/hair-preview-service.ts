import "server-only";

import type { CapabilityResult } from "@hairfit/shared/consulting/capability";
import { generatePrompt, PROMPT_VERSION, type GeneratePromptInput } from "../prompt-generator";
import { createGenerationWorkflowInstance, getGenerationWorkflowBinding } from "../generation-workflow";
import { runDurableCapability } from "./durable-runtime";
import { HAIRFIT_LEGACY_SOURCE_REVISION, runInlineCapability, type CapabilityEngineAdapter } from "./runtime";

type PromptOutput = Awaited<ReturnType<typeof generatePrompt>>;
const adapter: CapabilityEngineAdapter<GeneratePromptInput, PromptOutput> = {
  capability: "hair-preview-generation",
  engineVersion: "durable-generation-workflow-v1",
  sourceRevision: HAIRFIT_LEGACY_SOURCE_REVISION,
  provider: "gemini",
  model: process.env.PROMPT_LLM_MODEL || "gemini-2.5-flash",
  promptPolicyVersion: PROMPT_VERSION,
  catalogCycleId: null,
  fallbackMode: "none",
  execute: generatePrompt,
  failureCode: () => "HAIR_PREVIEW_PROMPT_FAILED",
  failureMessage: () => "헤어 프리뷰 준비를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
};

export function runHairPreviewPromptCapability(input: { userId?: string; consultationId: string; idempotencyKey: string; promptInput: GeneratePromptInput }): Promise<CapabilityResult<PromptOutput>> {
  const execution = { consultationId: input.consultationId, idempotencyKey: input.idempotencyKey, input: input.promptInput };
  return input.userId ? runDurableCapability(adapter, { ...execution, userId: input.userId }) : runInlineCapability(adapter, execution);
}

export const getHairPreviewWorkflowBinding = getGenerationWorkflowBinding;
export const createHairPreviewWorkflowInstance = createGenerationWorkflowInstance;
