import "server-only";

import type { CapabilityResult } from "@hairfit/shared/consulting/capability";
import {
  compileMakeupSemanticProjectionV3,
  type MakeupContextProfile,
  type MakeupDenseAtlasV3,
  type MakeupModule,
  type MakeupProtectedRegionV3,
  type MakeupSemanticArtifactV3,
  type MakeupSemanticProjectionV3,
} from "@hairfit/shared/makeup";
import { readDurableCapabilityResult, requestDurableCapabilityRetry, runDurableCapability } from "./durable-runtime";
import { capabilityFingerprint, type CapabilityEngineAdapter } from "./runtime";
import { getPromptVisionModel, getVisionProvider } from "../vision-model";
import { runMakeupSemanticProvider } from "../makeup/makeup-semantic-provider";

export const MAKEUP_SEMANTIC_ENGINE_VERSION = "makeup-semantic-map-v3";
export const MAKEUP_SEMANTIC_PROMPT_POLICY_VERSION = "makeup-semantic-anchor-selection-v1";

export interface MakeupSemanticCapabilityInput {
  sourceImageDataUrl: string;
  sourceFingerprint: string;
  sourceCorrectionRevision: number;
  atlas: MakeupDenseAtlasV3;
  context: Pick<MakeupContextProfile, "presentation" | "occasions" | "preparationMinutes" | "skillLevel" | "finishPreference" | "exclusions" | "facialHair">;
  modules: Array<{ module: MakeupModule; enabled: boolean }>;
  paletteAttributes: string[];
  protectedRegions: MakeupProtectedRegionV3[];
}

const model = getPromptVisionModel();

export const makeupSemanticAdapter: CapabilityEngineAdapter<MakeupSemanticCapabilityInput, MakeupSemanticProjectionV3> = {
  capability: "makeup-semantic-map",
  engineVersion: MAKEUP_SEMANTIC_ENGINE_VERSION,
  sourceRevision: MAKEUP_SEMANTIC_ENGINE_VERSION,
  provider: getVisionProvider(model),
  model,
  promptPolicyVersion: MAKEUP_SEMANTIC_PROMPT_POLICY_VERSION,
  catalogCycleId: null,
  fallbackMode: "deterministic",
  execute: async (input) => {
    const result = await runMakeupSemanticProvider({
      sourceImageDataUrl: input.sourceImageDataUrl,
      atlas: input.atlas,
      context: input.context,
      modules: input.modules,
      paletteAttributes: input.paletteAttributes,
    });
    const semanticOutputFingerprint = capabilityFingerprint(result.output);
    const artifact: MakeupSemanticArtifactV3 = {
      version: "makeup-semantic-artifact-v3",
      sourceFingerprint: input.sourceFingerprint,
      sourceCorrectionRevision: input.sourceCorrectionRevision,
      semanticOutputFingerprint,
      output: result.output,
    };
    return compileMakeupSemanticProjectionV3({ artifact, atlas: input.atlas, expectedSourceFingerprint: input.sourceFingerprint, protectedRegions: input.protectedRegions });
  },
  failureCode: (error) => error instanceof Error && /^MAKEUP_/u.test(error.message) ? error.message.split(":")[0] : "MAKEUP_SEMANTIC_MAP_FAILED",
  failureMessage: () => "AI 정밀 가이드를 불러오지 못해 기본 랜드마크 지도를 유지합니다.",
};

export function makeupSemanticInputFingerprint(input: Omit<MakeupSemanticCapabilityInput, "sourceImageDataUrl">) {
  return capabilityFingerprint({
    sourceFingerprint: input.sourceFingerprint,
    sourceCorrectionRevision: input.sourceCorrectionRevision,
    atlasVersion: input.atlas.version,
    atlasPointCount: input.atlas.uniqueSourcePointCount,
    context: input.context,
    modules: input.modules,
    paletteAttributes: input.paletteAttributes,
    protectedRegions: input.protectedRegions,
    promptPolicyVersion: MAKEUP_SEMANTIC_PROMPT_POLICY_VERSION,
    model,
  });
}

export function makeupSemanticIdempotencyKey(input: Omit<MakeupSemanticCapabilityInput, "sourceImageDataUrl">) {
  return `makeup-semantic:${makeupSemanticInputFingerprint(input)}`;
}

export function runMakeupSemanticCapability(input: MakeupSemanticCapabilityInput & { userId: string; consultationId: string }): Promise<CapabilityResult<MakeupSemanticProjectionV3>> {
  const idempotencyKey = makeupSemanticIdempotencyKey(input);
  return runDurableCapability(makeupSemanticAdapter, { userId: input.userId, consultationId: input.consultationId, idempotencyKey, input });
}

export async function retryMakeupSemanticCapability(input: MakeupSemanticCapabilityInput & { userId: string; consultationId: string }) {
  await requestDurableCapabilityRetry({ userId: input.userId, idempotencyKey: makeupSemanticIdempotencyKey(input) });
  return runMakeupSemanticCapability(input);
}

export function readMakeupSemanticCapability(input: Omit<MakeupSemanticCapabilityInput, "sourceImageDataUrl"> & { userId: string }) {
  return readDurableCapabilityResult(makeupSemanticAdapter, { userId: input.userId, idempotencyKey: makeupSemanticIdempotencyKey(input) });
}
