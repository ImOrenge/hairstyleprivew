import assert from "node:assert/strict";
import test from "node:test";
import {
  extractOpenAIResponseText,
  getPromptVisionModel,
  getVisionProvider,
} from "./vision-model.ts";

test("PROMPT_VISION_MODEL is authoritative for the face-analysis engine", () => {
  assert.equal(getPromptVisionModel({
    PROMPT_VISION_MODEL: "gpt-4o",
    PROMPT_RESEARCH_MODEL: "gemini-research",
    PROMPT_LLM_MODEL: "gemini-llm",
  }), "gpt-4o");
});

test("gpt-4o selects OpenAI while Gemini models retain the legacy provider", () => {
  assert.equal(getVisionProvider("gpt-4o"), "openai");
  assert.equal(getVisionProvider("gemini-2.5-flash"), "gemini");
});

test("OpenAI Responses output text is extracted from both response shapes", () => {
  assert.equal(extractOpenAIResponseText({ output_text: "{\"faceShape\":\"oval\"}" }), "{\"faceShape\":\"oval\"}");
  assert.equal(extractOpenAIResponseText({
    output: [{ content: [{ type: "output_text", text: "{\"faceShape\":\"round\"}" }] }],
  }), "{\"faceShape\":\"round\"}");
});
