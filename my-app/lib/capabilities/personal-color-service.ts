import "server-only";

import type { CapabilityResult } from "@hairfit/shared/consulting/capability";
import type { PersonalColorResult } from "../fashion-types";
import { analyzePersonalColor, getOpenAIVisionModel } from "../personal-color";
import { runDurableCapability } from "./durable-runtime";
import {
  HAIRFIT_LEGACY_SOURCE_REVISION,
  runInlineCapability,
  type CapabilityEngineAdapter,
} from "./runtime";

export interface PersonalColorCapabilityInput {
  referenceImageDataUrl: string;
  sourceImageFingerprint: string;
}

const personalColorAdapter: CapabilityEngineAdapter<PersonalColorCapabilityInput, PersonalColorResult> = {
  capability: "personal-color-analysis",
  engineVersion: "legacy-personal-color-v1",
  sourceRevision: HAIRFIT_LEGACY_SOURCE_REVISION,
  provider: "openai",
  model: getOpenAIVisionModel(),
  promptPolicyVersion: "personal-color-fixed-palette-v1",
  catalogCycleId: null,
  fallbackMode: "none",
  execute: ({ referenceImageDataUrl }) => analyzePersonalColor(referenceImageDataUrl),
  failureCode: () => "PERSONAL_COLOR_PROVIDER_FAILED",
  failureMessage: () => "퍼스널 컬러 분석을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
};

export function runPersonalColorCapability(input: {
  userId?: string;
  consultationId: string;
  idempotencyKey: string;
  referenceImageDataUrl: string;
  sourceImageFingerprint: string;
}): Promise<CapabilityResult<PersonalColorResult>> {
  const execution = {
    consultationId: input.consultationId,
    idempotencyKey: input.idempotencyKey,
    input: {
      referenceImageDataUrl: input.referenceImageDataUrl,
      sourceImageFingerprint: input.sourceImageFingerprint,
    },
  };
  return input.userId ? runDurableCapability(personalColorAdapter, { ...execution, userId: input.userId }) : runInlineCapability(personalColorAdapter, execution);
}
