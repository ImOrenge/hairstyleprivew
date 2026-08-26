import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(appRoot, ".open-next");
const assetsRoot = resolve(outputRoot, "assets");
const staticRoot = resolve(assetsRoot, "_next", "static");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function walkFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

export function normalizeManifestAsset(value) {
  if (typeof value !== "string") return null;
  const normalized = value.replaceAll("\\", "/").replace(/^\/+/, "");
  const marker = normalized.indexOf("_next/static/");
  if (marker >= 0) return normalized.slice(marker);
  if (normalized.startsWith("static/")) return `_next/${normalized}`;
  return null;
}

export function collectManifestAssets(value, assets = new Set()) {
  if (typeof value === "string") {
    const normalized = normalizeManifestAsset(value);
    if (normalized) assets.add(normalized);
    return assets;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectManifestAssets(item, assets);
    return assets;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectManifestAssets(item, assets);
  }
  return assets;
}

export function extractHtmlStaticAssets(html) {
  const assets = new Set();
  const pattern = /(?:src|href)=["']([^"']+)["']/giu;
  for (const match of html.matchAll(pattern)) {
    const url = match[1];
    if (url.startsWith("/_next/static/")) assets.add(url);
  }
  return [...assets].sort();
}

export function expectedMimePattern(pathname) {
  const extension = extname(new URL(pathname, "https://hairfit.invalid").pathname).toLowerCase();
  if (extension === ".css") return /^text\/css(?:;|$)/iu;
  if ([".js", ".mjs"].includes(extension)) return /^(?:application|text)\/javascript(?:;|$)/iu;
  if ([".woff", ".woff2", ".ttf", ".otf"].includes(extension)) return /^(?:font\/|application\/(?:font-|x-font-))/iu;
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".ico"].includes(extension)) return /^image\//iu;
  return null;
}

export function assertWranglerAssetBinding(configPath, expectedDirectory) {
  const source = readFileSync(configPath, "utf8");
  const escapedDirectory = expectedDirectory.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  assert(/"assets"\s*:\s*\{/u.test(source), `${relative(appRoot, configPath)} is missing an assets block`);
  assert(
    new RegExp(`"directory"\\s*:\\s*"${escapedDirectory}"`, "u").test(source),
    `${relative(appRoot, configPath)} must upload ${expectedDirectory}`,
  );
  assert(/"binding"\s*:\s*"ASSETS"/u.test(source), `${relative(appRoot, configPath)} is missing the ASSETS binding`);
}

function readBuildManifestAssets() {
  const functionsRoot = resolve(outputRoot, "server-functions");
  const manifestFiles = walkFiles(functionsRoot).filter((file) => (
    file.endsWith(".json") && /manifest/iu.test(file)
  ));
  const assets = new Set();
  for (const manifestPath of manifestFiles) {
    try {
      collectManifestAssets(JSON.parse(readFileSync(manifestPath, "utf8")), assets);
    } catch (error) {
      throw new Error(`Could not parse ${relative(appRoot, manifestPath)}: ${error.message}`);
    }
  }
  return assets;
}

export function verifyLocalArtifacts() {
  assert(existsSync(resolve(outputRoot, "worker.js")), ".open-next/worker.js is missing; run the OpenNext build before upload");
  assert(existsSync(staticRoot), ".open-next/assets/_next/static is missing; refusing an asset-less upload");
  const deploymentMarkerPath = resolve(outputRoot, "hairfit-deployment.json");
  assert(existsSync(deploymentMarkerPath), ".open-next/hairfit-deployment.json is missing; refusing a build without skew protection");
  const deploymentMarker = JSON.parse(readFileSync(deploymentMarkerPath, "utf8"));
  assert(
    /^[0-9a-f]{40}$/u.test(deploymentMarker.deploymentId ?? "") &&
      deploymentMarker.sourceRevision === deploymentMarker.deploymentId,
    "OpenNext deployment marker must bind sourceRevision and deploymentId to one 40-character Git SHA",
  );

  assertWranglerAssetBinding(resolve(appRoot, "wrangler.jsonc"), ".open-next/assets");
  assertWranglerAssetBinding(
    resolve(appRoot, "workers", "open-next-multi", "wrangler.server.jsonc"),
    "../../.open-next/assets",
  );
  assertWranglerAssetBinding(
    resolve(appRoot, "workers", "open-next-multi", "wrangler.middleware.jsonc"),
    "../../.open-next/assets",
  );

  const files = walkFiles(staticRoot);
  const counts = Object.fromEntries([".js", ".css", ".woff2"].map((extension) => [
    extension,
    files.filter((file) => extname(file).toLowerCase() === extension).length,
  ]));
  for (const [extension, count] of Object.entries(counts)) {
    assert(count > 0, `.open-next assets contain no ${extension} files`);
  }
  for (const file of files) {
    assert(statSync(file).size > 0, `OpenNext asset is empty: ${relative(assetsRoot, file)}`);
  }

  const manifestAssets = readBuildManifestAssets();
  assert(manifestAssets.size > 0, "OpenNext build manifests contain no static asset references");
  const missing = [...manifestAssets].filter((asset) => !existsSync(resolve(assetsRoot, ...asset.split("/"))));
  assert(
    missing.length === 0,
    `OpenNext manifests reference ${missing.length} missing assets:\n${missing.slice(0, 20).join("\n")}`,
  );

  return { files: files.length, manifestAssets: manifestAssets.size, counts, deploymentId: deploymentMarker.deploymentId };
}

export async function verifyLiveAssets(pageUrl) {
  const target = new URL(pageUrl);
  target.searchParams.set("hairfit_asset_check", Date.now().toString());
  const htmlResponse = await fetch(target, {
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
    redirect: "follow",
  });
  assert(htmlResponse.ok, `Live page returned ${htmlResponse.status}: ${target.origin}${target.pathname}`);
  const html = await htmlResponse.text();
  const assets = extractHtmlStaticAssets(html);
  assert(assets.length > 0, `Live page exposes no /_next/static assets: ${target.origin}${target.pathname}`);
  const deploymentId = html.match(/<html[^>]*\sdata-dpl-id=["']([^"']+)["']/iu)?.[1] ?? "";
  assert(/^[0-9a-f]{40}$/u.test(deploymentId), `Live page is missing a Git SHA data-dpl-id: ${target.origin}${target.pathname}`);
  const unversionedAssets = assets.filter((assetPath) => new URL(assetPath, target.origin).searchParams.get("dpl") !== deploymentId);
  assert(
    unversionedAssets.length === 0,
    `Live page exposes ${unversionedAssets.length} assets without matching ?dpl=${deploymentId}`,
  );

  const failures = [];
  await Promise.all(assets.map(async (assetPath) => {
    const assetUrl = new URL(assetPath, target.origin);
    const response = await fetch(assetUrl, {
      headers: { "cache-control": "no-cache", pragma: "no-cache" },
      redirect: "follow",
    });
    const contentType = response.headers.get("content-type") ?? "";
    const expected = expectedMimePattern(assetUrl.pathname);
    if (!response.ok || (expected && !expected.test(contentType))) {
      failures.push(`${assetUrl.pathname} -> ${response.status} ${contentType || "missing-content-type"}`);
    }
    await response.body?.cancel();
  }));
  assert(
    failures.length === 0,
    `Live HTML/static asset deployment mismatch (${failures.length}/${assets.length}):\n${failures.slice(0, 30).join("\n")}`,
  );
  return { page: `${target.origin}${target.pathname}`, assets: assets.length, deploymentId };
}

async function main() {
  const liveArguments = process.argv.filter((value) => value.startsWith("--url="));
  if (liveArguments.length > 0) {
    for (const liveArgument of liveArguments) {
      const result = await verifyLiveAssets(liveArgument.slice("--url=".length));
      console.log(`[cf:assets] live page=${result.page} assets=${result.assets} deploymentId=${result.deploymentId} status=ok`);
    }
    return;
  }
  const result = verifyLocalArtifacts();
  console.log(
    `[cf:assets] local files=${result.files} manifestRefs=${result.manifestAssets} ` +
    `js=${result.counts[".js"]} css=${result.counts[".css"]} fonts=${result.counts[".woff2"]} ` +
    `deploymentId=${result.deploymentId} status=ok`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[cf:assets] failed: ${error.message}`);
    process.exitCode = 1;
  });
}
