import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_AFTERCARE_LLM_MODEL,
  getAftercareLlmModel,
} from "./aftercare-model.ts";

test("uses the supported stable aftercare model by default", () => {
  assert.equal(getAftercareLlmModel({}), DEFAULT_AFTERCARE_LLM_MODEL);
  assert.equal(DEFAULT_AFTERCARE_LLM_MODEL, "gemini-3.5-flash");
});

test("accepts an explicit aftercare model override", () => {
  assert.equal(
    getAftercareLlmModel({ AFTERCARE_LLM_MODEL: " gemini-3.1-flash-lite " }),
    "gemini-3.1-flash-lite",
  );
});

test("ignores empty and placeholder aftercare model values", () => {
  assert.equal(
    getAftercareLlmModel({ AFTERCARE_LLM_MODEL: "   " }),
    DEFAULT_AFTERCARE_LLM_MODEL,
  );
  assert.equal(
    getAftercareLlmModel({ AFTERCARE_LLM_MODEL: "YOUR_AFTERCARE_MODEL" }),
    DEFAULT_AFTERCARE_LLM_MODEL,
  );
});
