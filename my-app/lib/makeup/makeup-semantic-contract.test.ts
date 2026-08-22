import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isMakeupDenseAtlasV3Enabled, isMakeupSemanticVisionStaffOnly, isMakeupSemanticVisionV3Enabled } from "../consulting/feature-flag.ts";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("makeup semantic provider sends two bounded images and requires strict structured output", () => {
  const provider = read("./makeup-semantic-provider.ts");
  assert.match(provider, /MAX_IMAGE_BYTES = 15 \* 1024 \* 1024/);
  assert.match(provider, /REFERENCE_HEIGHT = 1024/);
  assert.equal((provider.match(/type: "input_image"/g) ?? []).length, 2);
  assert.match(provider, /type: "json_schema"/);
  assert.match(provider, /strict: true/);
  assert.match(provider, /MAKEUP_SEMANTIC_MAP_V3_JSON_SCHEMA/);
  assert.match(provider, /withSingleRetry/);
  assert.match(provider, /PROVIDER_ATTEMPT_TIMEOUT_MS = 5_500/);
  assert.match(provider, /attempt < 2/);
  assert.doesNotMatch(provider, /userId|consultationId|signedUrl|storagePath/);
});

test("makeup semantic capability persists only validated projection through the durable runtime", () => {
  const service = read("../capabilities/makeup-semantic-map-service.ts");
  const runtime = read("../capabilities/durable-runtime.ts");
  assert.match(service, /capability: "makeup-semantic-map"/);
  assert.match(service, /runDurableCapability/);
  assert.match(service, /compileMakeupSemanticProjectionV3/);
  assert.match(service, /fallbackMode: "deterministic"/);
  assert.match(runtime, /consultation_capability_tasks_v2/);
  assert.match(runtime, /consultation_capability_attempts_v2/);
  assert.match(runtime, /consultation_capability_results_v2/);
});

test("makeup canvas keeps color-chip connectors and eye-feature guides without application landmarks", () => {
  const renderer = read("../../components/consulting/makeup/MakeupDirectionPaths.tsx");
  const stage = read("../../components/consulting/makeup/MakeupDirectionStage.tsx");
  assert.match(renderer, /data-makeup-dense-atlas/);
  assert.match(renderer, /data-makeup-semantic-lines/);
  assert.match(renderer, /PRIMARY_STRUCTURE_LINE_IDS/);
  assert.match(renderer, /ACTIVE_ATLAS_LINE_IDS/);
  assert.match(renderer, /dedupedAtlasPath/);
  assert.match(renderer, /connectors\.map\(\(connector\)/);
  assert.match(renderer, /data-makeup-eye-feature-guides/);
  assert.match(renderer, /data-makeup-eye-feature-guide=\{`eyeliner-/);
  assert.match(renderer, /data-makeup-eye-feature-guide=\{`lashes-/);
  assert.match(renderer, /vectorEffect="non-scaling-stroke"/);
  assert.doesNotMatch(renderer, /<circle|<ellipse|<polygon|<marker/);
  assert.match(renderer, /mode !== "application" && topology/);
  assert.match(renderer, /mode === "application" && eyeFeatureGuides\.length/);
  assert.match(stage, /semantic-map/);
  assert.match(stage, /setInterval\(\(\) => void load/);
  assert.match(stage, /clearInterval\(timer\)/);
  assert.doesNotMatch(stage, /7 MODULE TOOLBAR|ACTIVE ZONE DETAIL/);
  assert.doesNotMatch(stage, />Next<|>NEXT</);
});

test("P38 flags provide independent atlas, semantic, and staff-only rollback gates", () => {
  const flags = read("../consulting/feature-flag.ts");
  const readiness = read("../../scripts/verify-hairfit-v2-live-readiness.mjs");
  assert.match(flags, /MAKEUP_DENSE_ATLAS_V3/);
  assert.match(flags, /MAKEUP_SEMANTIC_VISION_V3/);
  assert.match(flags, /MAKEUP_SEMANTIC_VISION_STAFF_ONLY/);
  assert.match(flags, /isMakeupDenseAtlasV3Enabled\(env\) && env\.MAKEUP_SEMANTIC_VISION_V3 === "true"/);
  assert.equal(isMakeupDenseAtlasV3Enabled({ MAKEUP_DENSE_ATLAS_V3: "false" }), false);
  assert.equal(
    isMakeupSemanticVisionV3Enabled({
      MAKEUP_DENSE_ATLAS_V3: "false",
      MAKEUP_SEMANTIC_VISION_V3: "true",
    }),
    false,
  );
  assert.equal(
    isMakeupSemanticVisionV3Enabled({
      MAKEUP_DENSE_ATLAS_V3: "true",
      MAKEUP_SEMANTIC_VISION_V3: "true",
    }),
    true,
  );
  assert.equal(isMakeupSemanticVisionStaffOnly({}), true);
  assert.match(readiness, /"MAKEUP_DENSE_ATLAS_V3"/);
  assert.match(readiness, /"MAKEUP_SEMANTIC_VISION_V3"/);
  assert.match(readiness, /"MAKEUP_SEMANTIC_VISION_STAFF_ONLY"/);
});
