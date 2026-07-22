export const GENERATION_FUNNEL_EVENTS = [
  "draft_started",
  "accepted",
  "terminal",
  "result_opened",
] as const;

export type GenerationFunnelEvent = (typeof GENERATION_FUNNEL_EVENTS)[number];
export type GenerationFunnelClientSource = "web" | "mobile";

const GENERATION_FUNNEL_EVENT_SET = new Set<string>(GENERATION_FUNNEL_EVENTS);

export function isGenerationFunnelEvent(value: unknown): value is GenerationFunnelEvent {
  return typeof value === "string" && GENERATION_FUNNEL_EVENT_SET.has(value);
}

export function generationFunnelStageIndex(event: GenerationFunnelEvent) {
  return GENERATION_FUNNEL_EVENTS.indexOf(event);
}
