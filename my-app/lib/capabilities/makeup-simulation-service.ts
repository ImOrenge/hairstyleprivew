import "server-only";

import { runOpenAIMakeupStyleSimulation } from "../openai-image";
import { runDurableCapability } from "./durable-runtime";
import { HAIRFIT_LEGACY_SOURCE_REVISION, type CapabilityEngineAdapter } from "./runtime";

export interface MakeupSimulationCapabilityInput { imageDataUrl: string; mode: string; palette: string[]; modules: Array<{ module: string; color: string; intensity: number; finish: string }>; exclusions: string[] }
const adapter: CapabilityEngineAdapter<MakeupSimulationCapabilityInput, Awaited<ReturnType<typeof runOpenAIMakeupStyleSimulation>>> = {
  capability: "makeup-simulation-generation", engineVersion: "makeup-simulation-v1", sourceRevision: HAIRFIT_LEGACY_SOURCE_REVISION,
  provider: "openai", model: "gpt-image-2", promptPolicyVersion: "makeup-preservation-v1", catalogCycleId: null, fallbackMode: "none",
  execute: (input) => runOpenAIMakeupStyleSimulation({ ...input, quality: "medium" }),
  failureCode: () => "MAKEUP_SIMULATION_GENERATION_FAILED", failureMessage: () => "메이크업 스타일 시뮬레이션을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
};
export function runMakeupSimulationCapability(input: MakeupSimulationCapabilityInput & { userId: string; consultationId: string; idempotencyKey: string }) {
  return runDurableCapability(adapter, { userId: input.userId, consultationId: input.consultationId, idempotencyKey: input.idempotencyKey, input });
}
