import assert from "node:assert/strict";
import test from "node:test";
import { defaultMakeupInterviewProfile } from "../../../packages/shared/src/makeup/interview.ts";
import { mergeMakeupInterviewTopic } from "./makeup-interview-topic.ts";

const context = {
  presentation: "natural_grooming" as const,
  occasions: ["daily"],
  preparationMinutes: 10 as const,
  skillLevel: "basic" as const,
  finishPreference: "natural" as const,
  exclusions: [],
  ownedProductTypes: ["컨실러"],
  ownedToolTypes: [],
  gender: "not_provided" as const,
  facialHair: { type: "none" as const, userWantsCoverage: false },
};

test("makeup interview saves only the submitted topic fields", () => {
  const persisted = { ...defaultMakeupInterviewProfile(context), primaryMode: "daily_natural" as const, primaryOccasion: "daily", revision: 4 };
  const submitted = { ...persisted, primaryMode: "fashion_editorial" as const, primaryOccasion: "event", ownedProductTypes: ["립"] };
  const saved = mergeMakeupInterviewTopic(persisted, submitted, "mode");

  assert.equal(saved.primaryMode, "fashion_editorial");
  assert.equal(saved.primaryOccasion, "daily");
  assert.deepEqual(saved.ownedProductTypes, ["컨실러"]);
  assert.equal(saved.revision, 4);
});
