import assert from "node:assert/strict";
import test from "node:test";
import { buildHairProfileRolloutDecision, stableHairProfileRolloutBucket } from "./hair-profile-rollout.ts";
import type { CurrentHairProfile } from "./recommendation-types.ts";

const knownProfile: CurrentHairProfile = {
  currentLength: "medium",
  textureType: "tight_curly_frizzy",
  strandThickness: "coarse",
  conditionTags: ["bleached", "damaged"],
  damageLevel: "high",
  desiredLength: "long",
  source: "user",
};

test("master flag is an immediate fail-closed rollback", () => {
  const live = buildHairProfileRolloutDecision("user-rollback", knownProfile, {
    HAIR_PROFILE_MATCHING_V2_ENABLED: "true",
    HAIR_PROFILE_MATCHING_V2_MODE: "live",
    HAIR_PROFILE_MATCHING_V2_ROLLOUT_PERCENT: "100",
  });
  const rolledBack = buildHairProfileRolloutDecision("user-rollback", knownProfile, {
    HAIR_PROFILE_MATCHING_V2_ENABLED: "false",
    HAIR_PROFILE_MATCHING_V2_MODE: "live",
    HAIR_PROFILE_MATCHING_V2_ROLLOUT_PERCENT: "100",
  });

  assert.equal(live.mode, "live");
  assert.equal(rolledBack.mode, "off");
  assert.equal(rolledBack.reason, "master_flag_off");
});

test("shadow and internal-only stages do not depend on random request state", () => {
  const shadow = buildHairProfileRolloutDecision("member-shadow", knownProfile, {
    HAIR_PROFILE_MATCHING_V2_ENABLED: "true",
    HAIR_PROFILE_MATCHING_V2_MODE: "shadow",
  });
  const internal = buildHairProfileRolloutDecision("member-internal", knownProfile, {
    HAIR_PROFILE_MATCHING_V2_ENABLED: "true",
    HAIR_PROFILE_MATCHING_V2_MODE: "live",
    HAIR_PROFILE_MATCHING_V2_ROLLOUT_PERCENT: "0",
    HAIR_PROFILE_MATCHING_V2_INTERNAL_USER_IDS: "member-one, member-internal",
  });
  const control = buildHairProfileRolloutDecision("member-control", knownProfile, {
    HAIR_PROFILE_MATCHING_V2_ENABLED: "true",
    HAIR_PROFILE_MATCHING_V2_MODE: "live",
    HAIR_PROFILE_MATCHING_V2_ROLLOUT_PERCENT: "0",
    HAIR_PROFILE_MATCHING_V2_INTERNAL_USER_IDS: "member-one, member-internal",
  });

  assert.equal(shadow.mode, "shadow");
  assert.equal(internal.reason, "internal_allowlist");
  assert.equal(internal.mode, "live");
  assert.equal(control.reason, "percentage_control");
  assert.equal(control.mode, "shadow");
});

test("10, 50, and 100 percent stages use a stable user bucket", () => {
  const ids = Array.from({ length: 1000 }, (_, index) => `rollout-member-${index}`);
  const buckets = ids.map(stableHairProfileRolloutBucket);
  assert.deepEqual(buckets, ids.map(stableHairProfileRolloutBucket));

  for (const percentage of [10, 50, 100]) {
    const liveCount = ids.filter((userId) => buildHairProfileRolloutDecision(userId, knownProfile, {
      HAIR_PROFILE_MATCHING_V2_ENABLED: "true",
      HAIR_PROFILE_MATCHING_V2_MODE: "live",
      HAIR_PROFILE_MATCHING_V2_ROLLOUT_PERCENT: String(percentage),
    }).mode === "live").length;

    if (percentage === 100) {
      assert.equal(liveCount, ids.length);
    } else {
      assert.ok(Math.abs(liveCount / ids.length - percentage / 100) < 0.04, `${percentage}% bucket drifted: ${liveCount}`);
    }
  }
});

test("unknown profiles and invalid rollout modes stay off", () => {
  const unknownProfile: CurrentHairProfile = {
    currentLength: "unknown",
    textureType: "unknown",
    strandThickness: "unknown",
    conditionTags: [],
    damageLevel: "unknown",
    desiredLength: null,
    source: "unknown",
  };
  assert.equal(buildHairProfileRolloutDecision("member", unknownProfile, {
    HAIR_PROFILE_MATCHING_V2_ENABLED: "true",
    HAIR_PROFILE_MATCHING_V2_MODE: "live",
    HAIR_PROFILE_MATCHING_V2_ROLLOUT_PERCENT: "100",
  }).reason, "profile_unknown");
  assert.equal(buildHairProfileRolloutDecision("member", knownProfile, {
    HAIR_PROFILE_MATCHING_V2_ENABLED: "true",
    HAIR_PROFILE_MATCHING_V2_MODE: "unexpected",
    HAIR_PROFILE_MATCHING_V2_ROLLOUT_PERCENT: "100",
  }).reason, "invalid_mode");
});
