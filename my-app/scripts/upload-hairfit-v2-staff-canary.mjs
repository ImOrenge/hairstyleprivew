import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SERVER_ROLLOUT_FLAGS } from "./set-hairfit-v2-cloudflare-off.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const configPath = "my-app/workers/open-next-multi/wrangler.server.jsonc";
const confirmation = "HAIRFIT_V2_STAFF_CANARY_UPLOAD";

export function buildStaffCanaryPayload() {
  return Object.fromEntries(SERVER_ROLLOUT_FLAGS.map((name) => [
    name,
    name === "ENTITLEMENT_V2_LEGACY_BRIDGE_ENABLED" ? "false" : "true",
  ]));
}

function argumentValue(name) {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

function runWrangler(args) {
  const environment = { ...process.env };
  delete environment.CLOUDFLARE_API_KEY;
  delete environment.CLOUDFLARE_API_TOKEN;
  const result = spawnSync("npx", ["wrangler", ...args], {
    cwd: repoRoot,
    env: environment,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const safeDetail = `${result.stderr || ""}\n${result.stdout || ""}`
      .replace(/[A-Za-z0-9_./:+-]{24,}/gu, "[redacted]")
      .slice(0, 1200)
      .trim();
    throw new Error(`Wrangler rejected the staff canary upload${safeDetail ? `: ${safeDetail}` : ""}`);
  }
  return result.stdout || "";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const apply = process.argv.includes("--apply");
  if (!apply) {
    console.log("HairFit V2 staff canary upload plan");
    console.log(`server rollout flags: ${SERVER_ROLLOUT_FLAGS.length}`);
    console.log("legacy entitlement bridge: false");
    console.log("production traffic changed: no");
    console.log("secret values rendered: no");
    process.exit(0);
  }
  if (argumentValue("--confirm") !== confirmation) {
    throw new Error(`--apply requires --confirm=${confirmation}`);
  }
  const sourceRevision = argumentValue("--source-revision");
  if (!/^[0-9a-f]{40}$/iu.test(sourceRevision)) {
    throw new Error("--apply requires --source-revision=<40-character Git SHA>");
  }

  const tempRoot = mkdtempSync(resolve(tmpdir(), "hairfit-v2-staff-canary-"));
  const secretsPath = resolve(tempRoot, "secrets.json");
  try {
    writeFileSync(secretsPath, `${JSON.stringify(buildStaffCanaryPayload())}\n`, { encoding: "utf8", mode: 0o600 });
    const output = runWrangler([
      "versions", "upload", "--config", configPath, "--keep-vars",
      "--var", `HAIRFIT_SOURCE_REVISION:${sourceRevision}`,
      "--secrets-file", secretsPath,
      "--message", "HairFit-V2-staff-canary",
    ]);
    const uploadedVersion = output.match(/Worker Version ID:\s*([0-9a-f-]+)/iu)?.[1];
    if (!uploadedVersion) throw new Error("Server upload succeeded without a parseable version ID");
    console.log(`server canary flags registered: ${SERVER_ROLLOUT_FLAGS.length}/${SERVER_ROLLOUT_FLAGS.length}`);
    console.log(`server version uploaded: ${uploadedVersion}`);
    console.log("server version deployed: no");
    console.log("production traffic changed: no");
    console.log("secret values rendered: no");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
