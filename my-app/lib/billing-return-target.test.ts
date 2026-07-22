import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_BILLING_RETURN_TARGET,
  normalizeBillingReturnTarget,
} from "./billing-return-target.ts";

const CUSTOMER_ID = "8c4c76b5-d91d-4d8a-bb0d-1a720e9d9882";
const SALON_WORKSPACE = `/salon/customers/${CUSTOMER_ID}/workspace`;
const GENERATION_ID = "cc27c8b9-1bd8-4dd8-a75d-92cc2f4bd25e";
const RESULT_RETURN_TARGET = `/result/${GENERATION_ID}?variant=variant_01-safe~value`;
const STYLING_SESSION_ID = "f46857d9-ce48-4ba1-8804-1e619fb8f5d7";
const STYLER_RETURN_TARGET = `/styler/${STYLING_SESSION_ID}`;

test("allows only exact paid-action return screens", () => {
  assert.equal(
    normalizeBillingReturnTarget("/generate"),
    "/workspace?nextStep=generate",
  );
  assert.equal(
    normalizeBillingReturnTarget("/workspace?nextStep=generate"),
    "/workspace?nextStep=generate",
  );
  assert.equal(normalizeBillingReturnTarget(SALON_WORKSPACE), SALON_WORKSPACE);
  assert.equal(normalizeBillingReturnTarget(RESULT_RETURN_TARGET), RESULT_RETURN_TARGET);
  assert.equal(normalizeBillingReturnTarget(STYLER_RETURN_TARGET), STYLER_RETURN_TARGET);
  assert.equal(
    normalizeBillingReturnTarget(`/salon/customers/${CUSTOMER_ID.toUpperCase()}/workspace`),
    SALON_WORKSPACE,
  );
  assert.equal(
    normalizeBillingReturnTarget(
      `/result/${GENERATION_ID.toUpperCase()}?variant=Variant_01-safe~value`,
    ),
    `/result/${GENERATION_ID}?variant=Variant_01-safe~value`,
  );
  assert.equal(
    normalizeBillingReturnTarget(`/styler/${STYLING_SESSION_ID.toUpperCase()}`),
    STYLER_RETURN_TARGET,
  );
});

test("billing entry and checkout both apply the same server allowlist", () => {
  const billingPage = readFileSync(new URL("../app/billing/page.tsx", import.meta.url), "utf8");
  const checkoutPage = readFileSync(
    new URL("../app/billing/checkout/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(billingPage, /normalizeBillingReturnTarget\(params\.returnTo\)/);
  assert.match(checkoutPage, /normalizeBillingReturnTarget\(params\.returnTo\)/);
  assert.doesNotMatch(checkoutPage, /startsWith\("\/"\)/);
});

test("accepts one ordinary URLSearchParams decoding layer but not a second layer", () => {
  const ordinary = new URLSearchParams("returnTo=%2Fgenerate").get("returnTo");
  const doubleEncoded = new URLSearchParams("returnTo=%252Fgenerate").get("returnTo");
  const ordinaryResult = new URLSearchParams(
    `returnTo=${encodeURIComponent(RESULT_RETURN_TARGET)}`,
  ).get("returnTo");
  const doubleEncodedResult = new URLSearchParams(
    `returnTo=${encodeURIComponent(encodeURIComponent(RESULT_RETURN_TARGET))}`,
  ).get("returnTo");
  const ordinaryStyler = new URLSearchParams(
    `returnTo=${encodeURIComponent(STYLER_RETURN_TARGET)}`,
  ).get("returnTo");
  const doubleEncodedStyler = new URLSearchParams(
    `returnTo=${encodeURIComponent(encodeURIComponent(STYLER_RETURN_TARGET))}`,
  ).get("returnTo");

  assert.equal(normalizeBillingReturnTarget(ordinary), "/workspace?nextStep=generate");
  assert.equal(normalizeBillingReturnTarget(doubleEncoded), DEFAULT_BILLING_RETURN_TARGET);
  assert.equal(normalizeBillingReturnTarget(ordinaryResult), RESULT_RETURN_TARGET);
  assert.equal(normalizeBillingReturnTarget(doubleEncodedResult), DEFAULT_BILLING_RETURN_TARGET);
  assert.equal(normalizeBillingReturnTarget(ordinaryStyler), STYLER_RETURN_TARGET);
  assert.equal(normalizeBillingReturnTarget(doubleEncodedStyler), DEFAULT_BILLING_RETURN_TARGET);
});

test("rejects external, protocol-relative, encoded, and ambiguous return targets", () => {
  const rejected: unknown[] = [
    undefined,
    null,
    ["/generate"],
    ["/generate", "/workspace?nextStep=generate"],
    "https://evil.example/generate",
    "http://evil.example/generate",
    "//evil.example/generate",
    "\\\\evil.example\\generate",
    "javascript:alert(1)",
    "%2Fgenerate",
    "/%67enerate",
    "/%2e%2e/generate",
    " /generate",
    "/generate ",
  ];

  for (const value of rejected) {
    assert.equal(normalizeBillingReturnTarget(value), DEFAULT_BILLING_RETURN_TARGET);
  }
});

test("rejects query, fragment, slash, and UUID mutations", () => {
  const rejected = [
    "/generate?nextStep=generate",
    "/generate#billing",
    "/workspace",
    "/workspace?nextStep=generate&nextStep=generate",
    "/workspace?nextStep=generate#billing",
    `/result/${GENERATION_ID}`,
    `/result/${GENERATION_ID}?variant=`,
    `/result/${GENERATION_ID}?variant=${"a".repeat(129)}`,
    `/result/${GENERATION_ID}?variant=variant%2D01`,
    `/result/${GENERATION_ID}?variant=variant+01`,
    `/result/${GENERATION_ID}?variant=variant/01`,
    `/result/${GENERATION_ID}?variant=variant-01&variant=variant-02`,
    `/result/${GENERATION_ID}?variant=variant-01&next=aftercare`,
    `/result/${GENERATION_ID}?next=aftercare&variant=variant-01`,
    `/result/${GENERATION_ID}?variant=variant-01#aftercare`,
    `/result/${GENERATION_ID}/?variant=variant-01`,
    "/result/not-a-uuid?variant=variant-01",
    "/result/cc27c8b9-1bd8-0dd8-a75d-92cc2f4bd25e?variant=variant-01",
    "/result/cc27c8b9-1bd8-4dd8-775d-92cc2f4bd25e?variant=variant-01",
    `${STYLER_RETURN_TARGET}/`,
    `${STYLER_RETURN_TARGET}?retry=1`,
    `${STYLER_RETURN_TARGET}#billing`,
    "/styler/not-a-uuid",
    "/styler/f46857d9-ce48-0ba1-8804-1e619fb8f5d7",
    "/styler/f46857d9-ce48-4ba1-7804-1e619fb8f5d7",
    "/styler/f46857d9-ce48-4ba1-8804-1e619fb8f5d7%2Fretry",
    `${SALON_WORKSPACE}/`,
    `${SALON_WORKSPACE}?nextStep=generate`,
    `${SALON_WORKSPACE}#billing`,
    "/salon/customers/not-a-uuid/workspace",
    "/salon/customers/8c4c76b5-d91d-0d8a-bb0d-1a720e9d9882/workspace",
    "/salon/customers/8c4c76b5-d91d-4d8a-7b0d-1a720e9d9882/workspace",
    "/salon/customers/8c4c76b5-d91d-4d8a-bb0d-1a720e9d9882%2Fworkspace",
  ];

  for (const value of rejected) {
    assert.equal(normalizeBillingReturnTarget(value), DEFAULT_BILLING_RETURN_TARGET);
  }
});
