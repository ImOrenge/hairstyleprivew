import assert from "node:assert/strict";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { assertPersonalColorProfileV2, type PersonalColorAxisEstimateV2, type PersonalColorProfileV2 } from "./contract.ts";
import { PERSONAL_COLOR_PROFILE_V2_JSON_SCHEMA } from "./schema.ts";

const unavailableAxis = (reason: string): PersonalColorAxisEstimateV2 => ({ value: null, confidence: 0, evidenceIds: [], unavailableReason: reason });

function profile(): PersonalColorProfileV2 {
  const createdAt = "2026-08-14T00:00:00.000Z";
  return {
    schemaVersion: "personal-color-profile-v2",
    id: "profile-v2",
    consultationId: "consultation-v2",
    version: 1,
    status: "partial_ready",
    captureMode: "quick",
    observationBundleId: null,
    calibration: { method: "none", referenceWhite: "D65", confidence: 0, version: "unavailable", meanDeltaE00: null },
    regions: [],
    axes: {
      temperature: unavailableAxis("observation bundle not ready"),
      value: unavailableAxis("observation bundle not ready"),
      chroma: unavailableAxis("observation bundle not ready"),
      contrast: unavailableAxis("observation bundle not ready"),
      hueCharacter: unavailableAxis("observation bundle not ready"),
    },
    seasonalPosterior: [],
    displayClassification: null,
    harmonyPalette: { best: [], base: [], accent: [], challenge: [], metals: [] },
    preferenceProfile: { likedColorIds: [], dislikedColorIds: [], preferredContrast: null },
    confidence: { overall: 0, typeConfidence: 0, paletteConfidence: 0, stability: 0 },
    modelManifest: { profileModel: "unavailable", axisPolicyVersion: "v0", posteriorVersion: "v0", paletteVersion: "v0", createdAt },
    legacyProjectionHash: null,
    drapeValidatedAt: null,
    confirmedAt: null,
    createdAt,
  };
}

test("personal color V2 contract represents unavailable axes without inventing zero values", () => {
  const value = profile();
  assert.doesNotThrow(() => assertPersonalColorProfileV2(value));
  const ajv = new Ajv2020({ strict: false });
  ajv.addFormat("date-time", true);
  const validate = ajv.compile(PERSONAL_COLOR_PROFILE_V2_JSON_SCHEMA);
  assert.equal(validate(value), true, JSON.stringify(validate.errors));
  assert.equal(value.axes.hueCharacter.value, null);
  assert.equal(PERSONAL_COLOR_PROFILE_V2_JSON_SCHEMA.properties.schemaVersion.const, "personal-color-profile-v2");
  assert.deepEqual(PERSONAL_COLOR_PROFILE_V2_JSON_SCHEMA.properties.axes.required, ["temperature", "value", "chroma", "contrast", "hueCharacter"]);
});

test("personal color V2 contract rejects a missing unavailable reason", () => {
  const value = profile();
  value.axes.temperature = { value: null, confidence: 0, evidenceIds: [], unavailableReason: null };
  assert.throws(() => assertPersonalColorProfileV2(value), /AXIS_INVALID/);
});
