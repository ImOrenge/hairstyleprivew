import assert from "node:assert/strict";
import test from "node:test";
import {
  SALON_CONNECTION_CONSENT_COPY,
  SALON_CONNECTION_CONSENT_SCOPE,
  SALON_CONNECTION_CONSENT_VERSION,
  createSalonConnectionConsentAcceptance,
  isSalonConnectionConsentAcceptance,
} from "./connection-consent.ts";

test("salon connection consent has a versioned least-privilege scope", () => {
  assert.match(SALON_CONNECTION_CONSENT_VERSION, /^\d{4}-\d{2}-\d{2}\.v\d+$/);
  assert.equal(SALON_CONNECTION_CONSENT_SCOPE.profile.email, true);
  assert.equal(SALON_CONNECTION_CONSENT_SCOPE.hairstyle.confirmedHairRecords, true);
  assert.equal(SALON_CONNECTION_CONSENT_SCOPE.aftercare.personalGuide, false);
  assert.equal(SALON_CONNECTION_CONSENT_SCOPE.aftercare.salonRecords, true);
  assert.ok(SALON_CONNECTION_CONSENT_COPY.retention.includes("연결을 해제하면"));
  assert.ok(SALON_CONNECTION_CONSENT_COPY.revocation.includes("일반 HairFit 기능"));
});

test("only explicit acceptance of the current version is valid", () => {
  const acceptance = createSalonConnectionConsentAcceptance();
  assert.equal(isSalonConnectionConsentAcceptance(acceptance), true);
  assert.equal(isSalonConnectionConsentAcceptance({ accepted: false, version: SALON_CONNECTION_CONSENT_VERSION }), false);
  assert.equal(isSalonConnectionConsentAcceptance({ accepted: true, version: "legacy-pre-consent" }), false);
  assert.equal(isSalonConnectionConsentAcceptance(null), false);
});
