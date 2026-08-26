import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseEnv,
  selectRuntimeSecrets,
} from "./upload-open-next-split-worker.mjs";
import { verifyLiveAssets } from "./verify-open-next-assets.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const confirmation = "HAIRFIT_ATOMIC_SPLIT_DEPLOY";
const productionOrigin = "https://hairfit.beauty";
const configs = Object.freeze({
  server: "workers/open-next-multi/wrangler.server.jsonc",
  media: "workers/open-next-multi/wrangler.media.jsonc",
  admin: "workers/open-next-multi/wrangler.admin.jsonc",
  router: "workers/open-next-multi/wrangler.middleware.jsonc",
});
const requiredRuntimeNames = Object.freeze([
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
]);

function argumentValue(name) {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

function safeDetail(value) {
  return value
    .replace(/[A-Za-z0-9_./:+-]{24,}/gu, "[redacted]")
    .slice(0, 1800)
    .trim();
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? appRoot,
    env: process.env,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 12 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = safeDetail(`${result.stderr || ""}\n${result.stdout || ""}`);
    throw new Error(`${command} ${args.slice(0, 3).join(" ")} failed${detail ? `: ${detail}` : ""}`);
  }
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

function runWrangler(args) {
  return run(process.platform === "win32" ? "npx.cmd" : "npx", ["wrangler", ...args]);
}

export function parseUploadedVersion(output) {
  const version = output.match(/Worker Version ID:\s*([0-9a-f-]+)/iu)?.[1] ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(version)) {
    throw new Error("Worker upload succeeded without a parseable version ID");
  }
  return version;
}

export function versionDeploymentArgs(currentVersion, nextVersion, config) {
  return [
    "versions", "deploy",
    `${currentVersion}@100%`,
    `${nextVersion}@0%`,
    "-y", "--config", config,
  ];
}

export function assertRouterState(state) {
  const entries = [
    state?.pinnedServerVersion,
    state?.pinnedMediaVersion,
    state?.pinnedAdminVersion,
  ];
  if (state?.service !== "hairstyleprivew-router" || entries.some((value) => !/^[0-9a-f-]{36}$/iu.test(value ?? ""))) {
    throw new Error("Live router did not expose valid pinned server, media, and admin versions");
  }
  return state;
}

async function fetchJson(pathname) {
  const url = new URL(pathname, productionOrigin);
  url.searchParams.set("hairfit_release_check", Date.now().toString());
  const response = await fetch(url, {
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
  });
  if (!response.ok) throw new Error(`${pathname} returned ${response.status}`);
  return response.json();
}

function uploadWorker(name, sourceRevision, secretsPath = "") {
  const args = [
    "versions", "upload",
    "--config", configs[name],
    "--keep-vars",
    "--var", `HAIRFIT_SOURCE_REVISION:${sourceRevision}`,
  ];
  if (secretsPath) args.push("--secrets-file", secretsPath);
  args.push("--message", `HairFit-atomic-${name}-${sourceRevision}`);
  return parseUploadedVersion(runWrangler(args));
}

export function assertBuiltRelease(sourceRevision, marker) {
  if (
    marker?.sourceRevision !== sourceRevision ||
    marker?.deploymentId !== sourceRevision
  ) {
    throw new Error("OpenNext artifacts were not built with this source revision as NEXT_DEPLOYMENT_ID");
  }
  return marker;
}

function registerVersion(currentVersion, nextVersion, config) {
  runWrangler(versionDeploymentArgs(currentVersion, nextVersion, config));
}

function uploadRouter(versions, sourceRevision) {
  return parseUploadedVersion(runWrangler([
    "versions", "upload",
    "--config", configs.router,
    "--keep-vars",
    "--var", `WORKER_VERSION_ID:${versions.server}`,
    "--var", `MEDIA_WORKER_VERSION_ID:${versions.media}`,
    "--var", `ADMIN_WORKER_VERSION_ID:${versions.admin}`,
    "--message", `HairFit-atomic-router-${sourceRevision}`,
  ]));
}

async function verifyRelease(sourceRevision, versions) {
  const expectedServices = [
    ["/.well-known/hairfit-deployment", "hairstyleprivew", versions.server],
    ["/.well-known/hairfit-media-deployment", "hairfit-media", versions.media],
    ["/.well-known/hairfit-admin-deployment", "hairfit-admin", versions.admin],
  ];
  const router = assertRouterState(await fetchJson("/.well-known/hairfit-router"));
  if (
    router.pinnedServerVersion !== versions.server ||
    router.pinnedMediaVersion !== versions.media ||
    router.pinnedAdminVersion !== versions.admin
  ) {
    throw new Error("Production router pins do not match the uploaded split release");
  }
  for (const [pathname, service, version] of expectedServices) {
    const response = await fetch(new URL(`${pathname}?hairfit_release_check=${Date.now()}`, productionOrigin), {
      headers: { "cache-control": "no-cache", pragma: "no-cache" },
    });
    const payload = await response.json();
    if (!response.ok || payload.service !== service || payload.sourceRevision !== sourceRevision) {
      throw new Error(`${service} did not report source revision ${sourceRevision}`);
    }
    if (response.headers.get("x-hairfit-pinned-server-version") !== version) {
      throw new Error(`${service} was not served through pinned version ${version}`);
    }
  }
  await verifyLiveAssets(`${productionOrigin}/login`);
  await verifyLiveAssets(`${productionOrigin}/consulting/e2e-harness`);
}

async function retryVerification(operation, attempts = 6) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));
    }
  }
  throw lastError;
}

async function main() {
  if (!process.argv.includes("--apply") || argumentValue("--confirm") !== confirmation) {
    throw new Error(`atomic split deployment requires --apply --confirm=${confirmation}`);
  }
  const sourceRevision = argumentValue("--source-revision");
  if (!/^[0-9a-f]{40}$/iu.test(sourceRevision)) {
    throw new Error("atomic split deployment requires --source-revision=<40-character Git SHA>");
  }
  const head = run("git", ["rev-parse", "HEAD"], { cwd: repoRoot }).trim();
  if (head !== sourceRevision) throw new Error(`source revision does not match HEAD (${head})`);
  const buildMarker = JSON.parse(readFileSync(resolve(appRoot, ".open-next", "hairfit-deployment.json"), "utf8"));
  assertBuiltRelease(sourceRevision, buildMarker);

  const envFile = argumentValue("--env-file");
  const runtimeInputs = envFile ? parseEnv(readFileSync(resolve(envFile), "utf8")) : process.env;
  const missing = requiredRuntimeNames.filter((name) => !runtimeInputs[name]?.trim());
  if (missing.length > 0) throw new Error(`Missing split Worker runtime inputs: ${missing.join(", ")}`);
  const runtimeSecrets = selectRuntimeSecrets(runtimeInputs);
  const current = assertRouterState(await fetchJson("/.well-known/hairfit-router"));
  const tempRoot = mkdtempSync(resolve(tmpdir(), "hairfit-atomic-split-"));
  const secretsPath = resolve(tempRoot, "secrets.json");
  try {
    writeFileSync(secretsPath, `${JSON.stringify(runtimeSecrets)}\n`, { encoding: "utf8", mode: 0o600 });
    const versions = {
      server: uploadWorker("server", sourceRevision),
      media: uploadWorker("media", sourceRevision, secretsPath),
      admin: uploadWorker("admin", sourceRevision, secretsPath),
    };
    registerVersion(current.pinnedServerVersion, versions.server, configs.server);
    registerVersion(current.pinnedMediaVersion, versions.media, configs.media);
    registerVersion(current.pinnedAdminVersion, versions.admin, configs.admin);
    versions.router = uploadRouter(versions, sourceRevision);
    runWrangler(["versions", "deploy", `${versions.router}@100%`, "-y", "--config", configs.router]);
    await retryVerification(() => verifyRelease(sourceRevision, versions));
    console.log(`atomic split release source: ${sourceRevision}`);
    console.log(`server version: ${versions.server}`);
    console.log(`media version: ${versions.media}`);
    console.log(`admin version: ${versions.admin}`);
    console.log(`router version: ${versions.router}`);
    console.log("live asset routes: 2/2 ok");
    console.log("secret values rendered: no");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[cf:atomic] failed: ${error.message}`);
    process.exitCode = 1;
  });
}
