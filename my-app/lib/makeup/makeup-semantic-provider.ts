import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  MAKEUP_SEMANTIC_MAP_V3_JSON_SCHEMA,
  assertMakeupSemanticMapV3,
  parseMakeupSemanticMapV3Json,
  type MakeupDenseAtlasV3,
  type MakeupSemanticMapV3,
} from "@hairfit/shared/makeup";
import { loadSharp } from "../sharp-loader.ts";
import { extractOpenAIResponseText, getPromptVisionModel, getVisionProvider, type OpenAIResponsePayload } from "../vision-model";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const REFERENCE_WIDTH = 819;
const REFERENCE_HEIGHT = 1024;
const PROVIDER_ATTEMPT_TIMEOUT_MS = 5_500;

function parseDataUrl(value: string) {
  const match = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/u.exec(value);
  if (!match) throw new Error("MAKEUP_SEMANTIC_IMAGE_INVALID");
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error("MAKEUP_SEMANTIC_IMAGE_INVALID");
  return { mimeType: match[1], buffer };
}

function dataUrl(mimeType: string, buffer: Buffer) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

const escapeXml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

async function normalizedSourceImage(sourceImageDataUrl: string) {
  const sharp = await loadSharp();
  const parsed = parseDataUrl(sourceImageDataUrl);
  const buffer = await sharp(parsed.buffer).rotate().resize({ width: REFERENCE_WIDTH, height: REFERENCE_HEIGHT, fit: "cover", position: "centre" }).webp({ quality: 84 }).toBuffer();
  return { buffer, dataUrl: dataUrl("image/webp", buffer) };
}

async function anchorReferenceImage(source: Buffer, atlas: MakeupDenseAtlasV3) {
  const sharp = await loadSharp();
  const labels: string[] = [];
  const paths: string[] = [];
  atlas.lineSets.forEach((line, lineIndex) => {
    const color = line.role === "application" ? "#ffd36b" : "#f8f1e2";
    const points = line.points.map((point) => `${(point.x * REFERENCE_WIDTH).toFixed(1)},${(point.y * REFERENCE_HEIGHT).toFixed(1)}`).join(" ");
    paths.push(`<polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.25" stroke-opacity="0.82"/>`);
    const labelPoint = line.points[Math.floor(line.points.length / 2)];
    const shortLabel = `L${String(lineIndex + 1).padStart(2, "0")}`;
    labels.push(`<text x="${(labelPoint.x * REFERENCE_WIDTH).toFixed(1)}" y="${(labelPoint.y * REFERENCE_HEIGHT).toFixed(1)}" fill="#fff" stroke="#111" stroke-width="2" paint-order="stroke" font-size="9" font-family="sans-serif">${shortLabel}</text>`);
    line.sourceIndices.forEach((sourceIndex, pointIndex) => {
      if (pointIndex % 3 !== 0) return;
      const point = line.points[pointIndex];
      const x = point.x * REFERENCE_WIDTH; const y = point.y * REFERENCE_HEIGHT;
      paths.push(`<path d="M ${x - 2} ${y} L ${x + 2} ${y}" fill="none" stroke="#fff" stroke-width="0.8"/>`);
      labels.push(`<text x="${x + 3}" y="${y - 2}" fill="#fff" stroke="#111" stroke-width="1.5" paint-order="stroke" font-size="6" font-family="sans-serif">${sourceIndex}</text>`);
    });
  });
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${REFERENCE_WIDTH}" height="${REFERENCE_HEIGHT}" viewBox="0 0 ${REFERENCE_WIDTH} ${REFERENCE_HEIGHT}"><g>${paths.join("")}${labels.join("")}</g></svg>`);
  const buffer = await sharp(source).composite([{ input: overlay, top: 0, left: 0 }]).webp({ quality: 86 }).toBuffer();
  return dataUrl("image/webp", buffer);
}

function anchorLegend(atlas: MakeupDenseAtlasV3) {
  return atlas.lineSets.map((line, index) => ({
    label: `L${String(index + 1).padStart(2, "0")}`,
    lineId: line.id,
    allowedSourceIndices: line.sourceIndices,
  }));
}

function prompt(input: MakeupSemanticProviderInput) {
  return `당신은 HairFit 메이크업 방향 분석기입니다. 첫 사진의 얼굴 픽셀은 수정하지 말고, 두 번째 reference map에서 관찰되는 실제 선과 번호만 선택하세요.
반드시 제공된 JSON Schema만 반환하세요. SVG, 자유 좌표, 성별·인종·연령·건강 추정, 제품 브랜드, 구매 권유는 금지합니다.
모든 설명은 짧은 한국어로 작성하세요. anchorRefs는 아래 allowlist의 lineId와 sourceIndex 조합만 사용하고 offset은 -0.025~0.025를 지키세요.
사용자 컨텍스트: ${JSON.stringify(input.context)}
활성 모듈: ${JSON.stringify(input.modules)}
퍼스널 컬러 속성: ${JSON.stringify(input.paletteAttributes)}
Anchor allowlist: ${JSON.stringify(anchorLegend(input.atlas))}`;
}

async function withSingleRetry<T>(operation: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("MAKEUP_SEMANTIC_PROVIDER_TIMEOUT")), PROVIDER_ATTEMPT_TIMEOUT_MS); }),
      ]);
    }
    catch (error) { lastError = error; }
    finally { if (timer) clearTimeout(timer); }
  }
  throw lastError;
}

export interface MakeupSemanticProviderInput {
  sourceImageDataUrl: string;
  atlas: MakeupDenseAtlasV3;
  context: Record<string, unknown>;
  modules: Array<{ module: string; enabled: boolean }>;
  paletteAttributes: string[];
}

export async function runMakeupSemanticProvider(input: MakeupSemanticProviderInput) {
  if (input.atlas.degradedReason) throw new Error("MAKEUP_DENSE_ATLAS_UNAVAILABLE");
  const source = await normalizedSourceImage(input.sourceImageDataUrl);
  const reference = await anchorReferenceImage(source.buffer, input.atlas);
  const modelName = getPromptVisionModel();
  const provider = getVisionProvider(modelName);
  const apiKey = provider === "openai" ? process.env.OPENAI_API_KEY : process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey.includes("YOUR_")) throw new Error("MAKEUP_SEMANTIC_PROVIDER_NOT_CONFIGURED");
  const instruction = prompt(input);
  let output: MakeupSemanticMapV3;

  if (provider === "openai") {
    output = await withSingleRetry(async () => {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelName,
          input: [{ role: "user", content: [
            { type: "input_text", text: instruction },
            { type: "input_image", image_url: source.dataUrl, detail: "high" },
            { type: "input_image", image_url: reference, detail: "high" },
          ] }],
          text: { format: { type: "json_schema", name: "hairfit_makeup_semantic_map_v3", strict: true, schema: MAKEUP_SEMANTIC_MAP_V3_JSON_SCHEMA } },
        }),
        signal: AbortSignal.timeout(PROVIDER_ATTEMPT_TIMEOUT_MS),
      });
      const payload = await response.json().catch(() => ({})) as OpenAIResponsePayload;
      if (!response.ok) throw new Error(payload.error?.message || "MAKEUP_SEMANTIC_PROVIDER_FAILED");
      return parseMakeupSemanticMapV3Json(extractOpenAIResponseText(payload));
    });
  } else {
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: modelName });
    const parsedSource = parseDataUrl(source.dataUrl); const parsedReference = parseDataUrl(reference);
    output = await withSingleRetry(async () => {
      const result = await model.generateContent({ contents: [{ role: "user", parts: [
        { text: instruction },
        { inlineData: { mimeType: parsedSource.mimeType, data: parsedSource.buffer.toString("base64") } },
        { inlineData: { mimeType: parsedReference.mimeType, data: parsedReference.buffer.toString("base64") } },
      ] }] });
      return parseMakeupSemanticMapV3Json(result.response.text());
    });
  }
  assertMakeupSemanticMapV3(output);
  return { output, model: modelName, provider };
}

export function makeupSemanticAnchorLegendForAudit(atlas: MakeupDenseAtlasV3) {
  return anchorLegend(atlas).map((item) => ({ ...item, lineId: escapeXml(item.lineId) }));
}
