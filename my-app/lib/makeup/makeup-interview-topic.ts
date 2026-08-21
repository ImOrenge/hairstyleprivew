import type { MakeupInterviewProfileV2, MakeupInterviewTopic } from "@hairfit/shared/makeup";

export function mergeMakeupInterviewTopic(
  persisted: MakeupInterviewProfileV2,
  submitted: MakeupInterviewProfileV2,
  topic: MakeupInterviewTopic,
): MakeupInterviewProfileV2 {
  if (topic === "mode") return { ...persisted, primaryMode: submitted.primaryMode };
  if (topic === "occasion") return { ...persisted, primaryOccasion: submitted.primaryOccasion, secondaryOccasions: [...submitted.secondaryOccasions] };
  if (topic === "finish") return { ...persisted, finishPreference: submitted.finishPreference };
  if (topic === "practicality") return { ...persisted, preparationMinutes: submitted.preparationMinutes, skillLevel: submitted.skillLevel };
  if (topic === "avoid") return { ...persisted, exclusions: [...submitted.exclusions], facialHair: { ...submitted.facialHair } };
  if (topic === "products") return { ...persisted, ownedProductTypes: [...submitted.ownedProductTypes] };
  return { ...persisted, ownedToolTypes: [...submitted.ownedToolTypes] };
}
