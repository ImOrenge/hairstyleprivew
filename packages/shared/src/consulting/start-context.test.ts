import assert from "node:assert/strict";
import test from "node:test";
import { createConsultationStartContext, deriveEffectiveConsultationIntent, isConsultationStartContextReady } from "./start-context.ts";

test("direct analysis creates no customer preference provenance", () => {
  const start = createConsultationStartContext({ now: "2026-08-20T00:00:00.000Z" });
  assert.equal(start.disposition, "direct_analysis");
  assert.equal(start.fieldSources.optionalOpeningIntent, null);
  assert.equal(isConsultationStartContextReady(start), true);
  const effective = deriveEffectiveConsultationIntent({ startContext: start });
  assert.equal(effective.scope, "total_styling");
  assert.equal(effective.scopeSource, "system_default");
  assert.equal(effective.changeLevel, "undecided");
  assert.equal(effective.changeLevelSource, null);
  assert.equal(effective.exclusions[0]?.state, "unknown");
});

test("optional opening intent records only the field the customer selected", () => {
  const start = createConsultationStartContext({ now: "2026-08-20T00:00:00.000Z", optionalOpeningIntent: "clear_change" });
  assert.equal(start.disposition, "optional_intent_answered");
  assert.equal(start.fieldSources.optionalOpeningIntent, "user");
  const effective = deriveEffectiveConsultationIntent({ startContext: start });
  assert.equal(effective.changeLevel, "clear_change");
  assert.equal(effective.changeLevelSource, "user");
});

test("confirmed legacy intent remains authoritative without rewriting it", () => {
  const effective = deriveEffectiveConsultationIntent({ legacyIntent: {
    scope: "hair_color", changeLevel: "maintain", exclusions: [], exclusionsConfirmed: true, confirmedAt: "2026-08-19T00:00:00.000Z",
  } });
  assert.equal(effective.scope, "hair_color");
  assert.equal(effective.scopeSource, "user");
  assert.equal(effective.changeLevel, "maintain");
  assert.equal(effective.exclusions[0]?.state, "none");
  assert.deepEqual(effective.unresolvedSafetyFieldIds, []);
});
