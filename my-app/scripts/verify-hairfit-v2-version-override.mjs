import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROUTER_WORKER = "hairstyleprivew-router";
const ALLOWED_BASE_URLS = new Set([
  "https://hairfit.beauty",
  "https://www.hairfit.beauty",
]);

function argumentValue(name) {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

export function validateVersionOverrideInputs({ baseUrl, routerVersionId, serverVersionId, sourceRevision, attempts, intervalMs }) {
  if (!ALLOWED_BASE_URLS.has(baseUrl)) throw new Error("base URL is not an approved HairFit production origin");
  for (const [name, value] of Object.entries({ routerVersionId, serverVersionId })) {
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(value)) {
      throw new Error(`${name} must be a Worker version UUID`);
    }
  }
  if (!/^[0-9a-f]{40}$/iu.test(sourceRevision)) throw new Error("sourceRevision must be a 40-character Git SHA");
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 24) throw new Error("attempts must be an integer from 1 to 24");
  if (!Number.isInteger(intervalMs) || intervalMs < 0 || intervalMs > 10_000) throw new Error("intervalMs must be an integer from 0 to 10000");
  return { baseUrl, routerVersionId, serverVersionId, sourceRevision, attempts, intervalMs };
}

export function evaluateVersionOverrideProbe({ routerPayload, sourcePayload, serverVersionId, sourceRevision }) {
  return {
    routerMatched: routerPayload?.service === ROUTER_WORKER && routerPayload?.pinnedServerVersion === serverVersionId,
    sourceMatched: sourcePayload?.service === "hairstyleprivew" && sourcePayload?.sourceRevision === sourceRevision,
  };
}

function wait(intervalMs) {
  return new Promise((resolve) => setTimeout(resolve, intervalMs));
}

async function readJson(url, headers) {
  const response = await fetch(url, { headers, cache: "no-store", redirect: "manual" });
  if (!response.ok) throw new Error(`probe returned HTTP ${response.status}`);
  return response.json();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const inputs = validateVersionOverrideInputs({
      baseUrl: argumentValue("--base-url") || "https://hairfit.beauty",
      routerVersionId: argumentValue("--router-version-id"),
      serverVersionId: argumentValue("--server-version-id"),
      sourceRevision: argumentValue("--source-revision"),
      attempts: Number(argumentValue("--attempts") || "12"),
      intervalMs: Number(argumentValue("--interval-ms") || "5000"),
    });
    const headers = {
      "Cloudflare-Workers-Version-Overrides": `${ROUTER_WORKER}="${inputs.routerVersionId}"`,
    };
    let passed = false;
    for (let attempt = 1; attempt <= inputs.attempts; attempt += 1) {
      const nonce = `${Date.now()}-${attempt}`;
      const [routerPayload, sourcePayload] = await Promise.all([
        readJson(`${inputs.baseUrl}/.well-known/hairfit-router?probe=${nonce}`, headers),
        readJson(`${inputs.baseUrl}/.well-known/hairfit-deployment?probe=${nonce}`, headers),
      ]);
      const result = evaluateVersionOverrideProbe({
        routerPayload,
        sourcePayload,
        serverVersionId: inputs.serverVersionId,
        sourceRevision: inputs.sourceRevision,
      });
      passed = result.routerMatched && result.sourceMatched;
      console.log(`override probe ${attempt}/${inputs.attempts}: ${passed ? "PASS" : "WAIT"}`);
      if (passed) break;
      if (attempt < inputs.attempts) await wait(inputs.intervalMs);
    }
    if (!passed) throw new Error("version override did not select the approved ON router and server");
    console.log("HairFit V2 version override: PASS");
  } catch (error) {
    console.error("HairFit V2 version override: FAILED");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
