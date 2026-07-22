import assert from "node:assert/strict";
import test from "node:test";
import {
  createGenerationResumeTarget,
  createSalonMatchResumeTarget,
  parseResumeTarget,
  parseResumeTargetPath,
  resumeTargetToPath,
  serializeResumeTarget,
  validateResumeTargetPath,
} from "./resume-target.ts";

const generationId = "123e4567-e89b-42d3-a456-426614174000";
const inviteCode = "a1b2c3d4e5f60718293a4b5c";

test("generation resume targets round-trip through storage and route formats", () => {
  const target = createGenerationResumeTarget(generationId.toUpperCase());

  assert.deepEqual(target, { kind: "generation", generationId });
  assert.equal(serializeResumeTarget(target), `generation:${generationId}`);
  assert.deepEqual(parseResumeTarget(`generation:${generationId}`), target);
  assert.equal(resumeTargetToPath(target), `/generate/${generationId}`);
  assert.deepEqual(parseResumeTargetPath(`/generate/${generationId}`), target);
  assert.equal(validateResumeTargetPath(`/generate/${generationId}`), `/generate/${generationId}`);
});

test("salon invite resume targets round-trip without accepting arbitrary paths", () => {
  const target = createSalonMatchResumeTarget(inviteCode);

  assert.deepEqual(target, { kind: "salon-match", inviteCode });
  assert.equal(serializeResumeTarget(target), `salon-match:${inviteCode}`);
  assert.deepEqual(parseResumeTarget(`salon-match:${inviteCode}`), target);
  assert.equal(resumeTargetToPath(target), `/salon/match/${inviteCode}`);
  assert.deepEqual(parseResumeTargetPath(`/salon/match/${inviteCode}`), target);
  assert.equal(validateResumeTargetPath(`/salon/match/${inviteCode}`), `/salon/match/${inviteCode}`);
});

test("resume target parsing rejects non-generation and malformed identifiers", () => {
  const invalidValues = [
    null,
    "",
    "home",
    "generation:not-a-uuid",
    "generation:00000000-0000-0000-0000-000000000000",
    `result:${generationId}`,
    "salon-match:short",
    "salon-match:https://evil.example",
    `generation:${generationId}${"x".repeat(80)}`,
  ];

  for (const value of invalidValues) {
    assert.equal(parseResumeTarget(value), null, String(value));
  }
});

test("resume path validation rejects external, protocol-relative, encoded, and ambiguous paths", () => {
  const invalidPaths = [
    `https://evil.example/generate/${generationId}`,
    `//evil.example/generate/${generationId}`,
    `\\\\evil.example\\generate\\${generationId}`,
    `/generate/${generationId}?from=email`,
    `/generate/${generationId}#result`,
    `/generate/${generationId}/`,
    "/generate/%2F%2Fevil.example",
    "/generate/not-a-uuid",
    `/result/${generationId}`,
    "/salon/match/short",
    "/salon/match/%2F%2Fevil.example",
    `/generate/${generationId}${"x".repeat(160)}`,
  ];

  for (const value of invalidPaths) {
    assert.equal(validateResumeTargetPath(value), null, value);
  }
});
