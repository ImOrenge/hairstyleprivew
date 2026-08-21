import assert from "node:assert/strict";
import test from "node:test";
import { runOpenAIHairColorChangeV2 } from "./openai-image.ts";

const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("hair color exploration and final requests use gpt-image-2 low and medium", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.OPENAI_API_KEY;
  const requests: Array<{ model: FormDataEntryValue | null; quality: FormDataEntryValue | null }> = [];

  context.after(() => {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  });

  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = (async (_input, init) => {
    const formData = init?.body as FormData;
    requests.push({ model: formData.get("model"), quality: formData.get("quality") });
    return new Response(JSON.stringify({ id: "image-test", data: [{ b64_json: "AA==" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const baseRequest = {
    imageDataUrl: PIXEL,
    maskDataUrl: PIXEL,
    colorName: "베이지 브라운",
    swatchHex: "#9A765B",
    technique: "full",
    targetLevel: 9,
    intensity: 70,
    temperature: 0,
    saturation: 0,
    rootDepth: 20,
  };
  await runOpenAIHairColorChangeV2({ ...baseRequest, quality: "low" });
  await runOpenAIHairColorChangeV2({ ...baseRequest, quality: "medium" });

  assert.deepEqual(requests, [
    { model: "gpt-image-2", quality: "low" },
    { model: "gpt-image-2", quality: "medium" },
  ]);
});
