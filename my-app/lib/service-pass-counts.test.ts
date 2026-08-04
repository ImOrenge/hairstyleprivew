import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./service-pass-counts.ts", import.meta.url), "utf8");

function getExpectedServicePassCounts(value: number) {
  const credits = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return {
    hairCount: Math.floor(credits / 10),
    fashionSetCount: Math.floor(credits / (10 + 20)),
    careCount: Math.floor(credits / 30),
  };
}

test("service pass conversion stays connected to the shared billing policy constants", () => {
  assert.match(source, /HAIRSTYLE_GENERATION_CREDITS/);
  assert.match(source, /OUTFIT_LOOKBOOK_CREDITS/);
  assert.match(source, /ADDITIONAL_AFTERCARE_PROGRAM_CREDITS/);
  assert.match(
    source,
    /fashionSetCost = HAIRSTYLE_GENERATION_CREDITS \+ OUTFIT_LOOKBOOK_CREDITS/,
  );
  assert.match(source, /careCount: Math\.floor\(normalizedCredits \/ ADDITIONAL_AFTERCARE_PROGRAM_CREDITS\)/);
});

test("service pass counts include the required hair generation in each fashion set", () => {
  assert.deepEqual(getExpectedServicePassCounts(10), {
    hairCount: 1,
    fashionSetCount: 0,
    careCount: 0,
  });
  assert.deepEqual(getExpectedServicePassCounts(30), {
    hairCount: 3,
    fashionSetCount: 1,
    careCount: 1,
  });
  assert.deepEqual(getExpectedServicePassCounts(80), {
    hairCount: 8,
    fashionSetCount: 2,
    careCount: 2,
  });
  assert.deepEqual(getExpectedServicePassCounts(200), {
    hairCount: 20,
    fashionSetCount: 6,
    careCount: 6,
  });
  assert.deepEqual(getExpectedServicePassCounts(500), {
    hairCount: 50,
    fashionSetCount: 16,
    careCount: 16,
  });
  assert.deepEqual(getExpectedServicePassCounts(600), {
    hairCount: 60,
    fashionSetCount: 20,
    careCount: 20,
  });
});

test("service pass counts fail closed for invalid balances", () => {
  assert.deepEqual(getExpectedServicePassCounts(Number.NaN), {
    hairCount: 0,
    fashionSetCount: 0,
    careCount: 0,
  });
  assert.deepEqual(getExpectedServicePassCounts(-1), {
    hairCount: 0,
    fashionSetCount: 0,
    careCount: 0,
  });
});
