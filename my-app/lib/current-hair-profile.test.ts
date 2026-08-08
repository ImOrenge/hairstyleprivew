import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCurrentHairProfile } from "./current-hair-profile.ts";

test("normalizes strand thickness and multiple condition tags", () => {
  assert.deepEqual(normalizeCurrentHairProfile({
    currentLength: "medium",
    textureType: "wavy_curly",
    strandThickness: "fine",
    conditionTags: ["bleached", "damaged", "bleached", "invalid"],
    damageLevel: "high",
    desiredLength: "long",
    source: "salon",
  }), {
    currentLength: "medium",
    textureType: "wavy_curly",
    strandThickness: "fine",
    conditionTags: ["bleached", "damaged"],
    damageLevel: "high",
    desiredLength: "long",
    source: "salon",
  });
});

test("unknown or malformed input falls back without inventing a profile", () => {
  assert.equal(normalizeCurrentHairProfile(null), null);
  assert.deepEqual(normalizeCurrentHairProfile({ strandThickness: "extra-coarse" }), {
    currentLength: "unknown",
    textureType: "unknown",
    strandThickness: "unknown",
    conditionTags: [],
    damageLevel: "unknown",
    desiredLength: null,
    source: "unknown",
  });
});
