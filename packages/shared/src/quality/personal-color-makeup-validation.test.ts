import assert from "node:assert/strict";
import test from "node:test";
import { PERSONAL_COLOR_TYPES_V2 } from "../personal-color-v2/contract.ts";
import { PERSONAL_COLOR_MAKEUP_OPENAPI_V2 } from "../v2/personal-color-makeup-openapi.ts";
import {
  PERSONAL_COLOR_MAKEUP_FIXTURES,
  evaluateLegacyPersonalColorRetirement,
  evaluatePersonalColorMakeupCanary,
  validateExpertPersonalColorLabels,
} from "./personal-color-makeup-validation.ts";

test("validation matrix covers all fourteen documented inclusive fixtures", () => {
  assert.equal(PERSONAL_COLOR_MAKEUP_FIXTURES.length, 14);
  assert.equal(new Set(PERSONAL_COLOR_MAKEUP_FIXTURES.map((fixture) => fixture.id)).size, 14);
  assert.ok(PERSONAL_COLOR_MAKEUP_FIXTURES.every((fixture) => fixture.requiredEvidence.length > 0));
});

test("expert workflow requires three independent complete posterior labels", () => {
  const posterior = PERSONAL_COLOR_TYPES_V2.map((type) => ({ type, probability: 1 / PERSONAL_COLOR_TYPES_V2.length }));
  const labels = ["expert-a", "expert-b", "expert-c"].map((annotatorPseudonym) => ({ caseId: "controlled-case-1", annotatorPseudonym, axes: {}, posterior, boundaryCase: true }));
  assert.deepEqual(validateExpertPersonalColorLabels(labels), { caseId: "controlled-case-1", annotatorCount: 3, boundaryVoteCount: 3 });
  assert.throws(() => validateExpertPersonalColorLabels(labels.slice(0, 2)), /COUNT_TOO_LOW/);
});

test("canary fails closed for structural mismatches and never passes an empty window", () => {
  assert.equal(evaluatePersonalColorMakeupCanary([]).status, "insufficient_data");
  assert.equal(evaluatePersonalColorMakeupCanary([{ profileProjectionMismatch: false, crossDomainProfileMismatch: false, missingExecutionArtifact: false }]).status, "pass");
  assert.equal(evaluatePersonalColorMakeupCanary([{ profileProjectionMismatch: false, crossDomainProfileMismatch: true, missingExecutionArtifact: false }]).status, "fail");
});

test("legacy retirement requires two releases, thirty days, and zero structural mismatch", () => {
  assert.equal(evaluateLegacyPersonalColorRetirement({ compatibleReleases: 1, observationDays: 30, structuralMismatchCount: 0 }).eligible, false);
  assert.equal(evaluateLegacyPersonalColorRetirement({ compatibleReleases: 2, observationDays: 30, structuralMismatchCount: 0 }).eligible, true);
});

test("OpenAPI document references the shared Personal Color and Makeup schemas", () => {
  assert.equal(PERSONAL_COLOR_MAKEUP_OPENAPI_V2.openapi, "3.1.0");
  assert.ok(PERSONAL_COLOR_MAKEUP_OPENAPI_V2.components.schemas.PersonalColorProfileV2);
  assert.ok(PERSONAL_COLOR_MAKEUP_OPENAPI_V2.components.schemas.MakeupDirectionSnapshot);
  assert.ok(PERSONAL_COLOR_MAKEUP_OPENAPI_V2.paths["/api/consultations/{consultationId}/makeup/modules/{module}"]);
});
