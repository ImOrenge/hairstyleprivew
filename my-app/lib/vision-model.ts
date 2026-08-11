export const DEFAULT_PROMPT_VISION_MODEL = "gemini-2.5-flash";

export type VisionProvider = "gemini" | "openai";

export function getPromptVisionModel(env: Record<string, string | undefined> = process.env) {
  return env.PROMPT_VISION_MODEL?.trim()
    || env.PROMPT_RESEARCH_MODEL?.trim()
    || env.PROMPT_LLM_MODEL?.trim()
    || DEFAULT_PROMPT_VISION_MODEL;
}

export function getVisionProvider(model: string): VisionProvider {
  return /^(?:gpt-|o\d)/u.test(model.trim().toLowerCase()) ? "openai" : "gemini";
}

interface OpenAIResponseContent {
  type?: string;
  text?: string;
}

interface OpenAIResponseOutput {
  content?: OpenAIResponseContent[];
}

export interface OpenAIResponsePayload {
  output_text?: string;
  output?: OpenAIResponseOutput[];
  error?: { message?: string };
}

export function extractOpenAIResponseText(payload: OpenAIResponsePayload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  for (const output of payload.output || []) {
    for (const content of output.content || []) {
      if (content.type === "output_text" && typeof content.text === "string" && content.text.trim()) {
        return content.text.trim();
      }
    }
  }

  return "";
}
