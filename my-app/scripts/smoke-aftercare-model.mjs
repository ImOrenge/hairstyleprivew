import envPackage from "@next/env";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAftercareLlmModel } from "../lib/aftercare-model.ts";

envPackage.loadEnvConfig(process.cwd());

const apiKey = process.env.GOOGLE_API_KEY?.trim();
if (!apiKey) {
  console.log("aftercare_model_smoke=skipped reason=missing_google_api_key");
  process.exit(0);
}

const modelName = getAftercareLlmModel();
const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
  model: modelName,
  generationConfig: {
    maxOutputTokens: 128,
    temperature: 0,
  },
});

const result = await model.generateContent("Reply with exactly OK");
const output = result.response.text().trim();

if (!output) {
  throw new Error(`Aftercare model ${modelName} returned an empty response.`);
}

console.log(
  `aftercare_model_smoke=ok model=${modelName} response_chars=${output.length}`,
);

const imageModelName = process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-3-pro-image";
const imageModelResponse = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(imageModelName)}`,
  {
    headers: {
      "x-goog-api-key": apiKey,
    },
  },
);

if (!imageModelResponse.ok) {
  throw new Error(
    `Gemini image model metadata check failed for ${imageModelName} with status ${imageModelResponse.status}.`,
  );
}

console.log(`gemini_image_model_smoke=ok model=${imageModelName}`);
