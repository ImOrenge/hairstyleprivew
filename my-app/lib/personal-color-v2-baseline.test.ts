import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HAIRFIT_V2_FEATURE_FLAGS } from "../../packages/shared/src/v2/feature-flags.ts";
import type { RawPersonalColorResult } from "./personal-color.ts";
import type { PersonalColorResult } from "./fashion-types.ts";
import { normalizePersonalColorResult } from "./personal-color.ts";
import { buildLegacyPersonalColorSuccessResponse, validateLegacyPersonalColorAnalyzeRequest } from "./personal-color-legacy-contract.ts";
import { comparePersonalColorProjectionHashes, hashPersonalColorProjection } from "./personal-color-projection.ts";
import { isHairfitV2Enabled } from "./v2/feature-flags.ts";
import { sanitizeV2EventPayload } from "./v2/observability-payload.ts";

const fixture = JSON.parse(readFileSync(new URL("../tests/fixtures/personal-color/legacy-personal-color-result.golden.json", import.meta.url), "utf8")) as {
  raw: RawPersonalColorResult;
  expected: ReturnType<typeof normalizePersonalColorResult>;
};

test("legacy personal color normalizer stays pinned to the current golden contract", () => {
  const result = normalizePersonalColorResult(fixture.raw, "golden-model", "2026-08-14T00:00:00.000Z");
  assert.deepEqual(result, fixture.expected);
});

test("legacy personal color fallback remains deterministic and visibly legacy", () => {
  const result = normalizePersonalColorResult({}, "fallback-model", "2026-08-14T00:00:00.000Z");
  assert.equal(result.tone, "neutral");
  assert.equal(result.contrast, "medium");
  assert.equal(result.primaryType, "summer_cool");
  assert.deepEqual(result.axes, { temperature: 0.5, value: 0.5, chroma: 0.5, contrast: 0.5 });
  assert.equal(result.detailVersion, undefined);
  assert.equal(result.confidence, 0.6);
  assert.deepEqual(result.stylingPalette, ["#F6E8D7", "#D8B58A", "#B98248", "#6E7045"]);
});

test("legacy analyze request and success response preserve the characterized API shape", () => {
  assert.deepEqual(validateLegacyPersonalColorAnalyzeRequest({}), { ok: false, error: "referenceImageDataUrl is required" });
  assert.deepEqual(validateLegacyPersonalColorAnalyzeRequest({ referenceImageDataUrl: " data:image/png;base64,AA== " }), { ok: true, referenceImageDataUrl: "data:image/png;base64,AA==" });
  const response = buildLegacyPersonalColorSuccessResponse(fixture.expected, { taskId: "task", state: "completed", provenance: "legacy" });
  assert.deepEqual(Object.keys(response), ["personalColor", "capability"]);
  assert.deepEqual(response.capability, { taskId: "task", state: "completed", provenance: "legacy" });
});

test("Phase 00 flags are registered and fail closed by default", () => {
  for (const flag of ["PERSONAL_COLOR_V2_WRITE", "PERSONAL_COLOR_V2_READ", "MAKEUP_DIRECTION_V1"] as const) {
    assert.equal(HAIRFIT_V2_FEATURE_FLAGS.includes(flag), true);
    assert.equal(isHairfitV2Enabled(flag, {} as NodeJS.ProcessEnv), false);
    assert.equal(isHairfitV2Enabled(flag, { [flag]: "true" } as NodeJS.ProcessEnv), true);
  }
});

test("projection telemetry hashes canonical data and never accepts image or skin payload fields", () => {
  const axes = fixture.expected.axes!;
  const reordered: PersonalColorResult = { ...fixture.expected, axes: { contrast: axes.contrast, chroma: axes.chroma, value: axes.value, temperature: axes.temperature } };
  assert.equal(hashPersonalColorProjection(fixture.expected), hashPersonalColorProjection(reordered));
  assert.deepEqual(comparePersonalColorProjectionHashes(fixture.expected, reordered), {
    legacyProjectionHash: hashPersonalColorProjection(fixture.expected),
    v2ProjectionHash: hashPersonalColorProjection(fixture.expected),
    matched: true,
  });
  const sanitized = sanitizeV2EventPayload({
    legacyProjectionHash: hashPersonalColorProjection(fixture.expected),
    v2ProjectionHash: null,
    matched: null,
    schemaVersion: "legacy-personal-color-v1",
    referenceImageDataUrl: "data:image/png;base64,secret",
    sourceAssetPath: "private/user/photo.jpg",
    skinSamples: [{ l: 50, a: 2, b: 8 }],
  });
  assert.deepEqual(Object.keys(sanitized).sort(), ["legacyProjectionHash", "matched", "schemaVersion", "v2ProjectionHash"].sort());
  assert.equal(JSON.stringify(sanitized).includes("secret"), false);
  assert.equal(JSON.stringify(sanitized).includes("private/user"), false);
});

test("legacy route retains authentication, owner profile, flag-off compatibility and redacted telemetry boundaries", () => {
  const route = readFileSync(new URL("../app/api/personal-color/analyze/route.ts", import.meta.url), "utf8");
  assert.match(route, /const \{ userId \} = await auth\(\)/);
  assert.match(route, /ensureCurrentUserProfile\(userId, supabase\)/);
  assert.match(route, /isHairfitV2Enabled\("PERSONAL_COLOR_V2_WRITE"\)/);
  assert.match(route, /buildLegacyPersonalColorSuccessResponse\(personalColor, capability\)/);
  const telemetryPayloads = [...route.matchAll(/payload:\s*\{([^}]*)\}/g)].map((match) => match[1]);
  assert.equal(telemetryPayloads.length, 2);
  for (const payload of telemetryPayloads) assert.doesNotMatch(payload, /referenceImageDataUrl|sourceAssetPath|skinSamples/);
});
