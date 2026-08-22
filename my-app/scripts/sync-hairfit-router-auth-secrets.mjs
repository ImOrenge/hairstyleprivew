import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClerkClient } from "@clerk/backend";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const envPath = resolve(appRoot, ".env.local");
const configPath = "my-app/workers/open-next-multi/wrangler.middleware.jsonc";
const targetWorker = "hairstyleprivew-router";
const confirmation = "HAIRFIT_ROUTER_AUTH_SECRETS";

export const ROUTER_AUTH_SECRET_NAMES = Object.freeze([
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
]);

function parseEnv(source) {
  const values = {};
  for (const line of source.split(/\r?\n/u)) {
    const match = line.match(/^\uFEFF?(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/u);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function runWrangler(args, input) {
  const environment = { ...process.env };
  delete environment.CLOUDFLARE_API_KEY;
  delete environment.CLOUDFLARE_API_TOKEN;
  const result = spawnSync("npx", ["wrangler", ...args], {
    cwd: repoRoot,
    env: environment,
    encoding: "utf8",
    input,
    shell: process.platform === "win32",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const safeDetail = `${result.stderr || ""}\n${result.stdout || ""}`
      .replace(/[A-Za-z0-9_./:+-]{24,}/gu, "[redacted]")
      .slice(0, 1200)
      .trim();
    throw new Error(`Wrangler rejected the router auth secret update${safeDetail ? `: ${safeDetail}` : ""}`);
  }
  return result.stdout || "";
}

function argumentValue(name) {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

async function assertProductionClerkCredential(secretKey) {
  try {
    const clerk = createClerkClient({ secretKey });
    await clerk.users.getUserList({ limit: 1 });
  } catch {
    throw new Error("Production Clerk API rejected the supplied router credential");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const apply = process.argv.includes("--apply");
  const suppliedConfirmation = argumentValue("--confirm");
  if (!apply) {
    console.log(`target Worker: ${targetWorker}`);
    console.log(`router auth secrets: ${ROUTER_AUTH_SECRET_NAMES.length}`);
    console.log("secret values rendered: no");
    process.exit(0);
  }
  if (suppliedConfirmation !== confirmation) {
    throw new Error(`--apply requires --confirm=${confirmation}`);
  }

  const sourceEnvPath = resolve(argumentValue("--env-file") || envPath);
  const versionIds = {
    server: argumentValue("--server-version-id"),
    media: argumentValue("--media-version-id"),
    admin: argumentValue("--admin-version-id"),
  };
  const invalidVersion = Object.entries(versionIds).find(([, value]) => (
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(value)
  ));
  if (invalidVersion) {
    throw new Error(`--apply requires --${invalidVersion[0]}-version-id=<UUID>`);
  }
  const local = parseEnv(readFileSync(sourceEnvPath, "utf8"));
  const missing = ROUTER_AUTH_SECRET_NAMES.filter((name) => !local[name]?.trim());
  if (missing.length) throw new Error(`Missing local router auth inputs: ${missing.join(", ")}`);
  if (!local.CLERK_SECRET_KEY.startsWith("sk_live_") || !local.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.startsWith("pk_live_")) {
    throw new Error("Production router auth sync requires matching live Clerk keys");
  }
  await assertProductionClerkCredential(local.CLERK_SECRET_KEY);
  const payload = Object.fromEntries(ROUTER_AUTH_SECRET_NAMES.map((name) => [name, local[name]]));
  const tempRoot = mkdtempSync(resolve(tmpdir(), "hairfit-router-auth-"));
  const secretsPath = resolve(tempRoot, "secrets.json");
  try {
    writeFileSync(secretsPath, `${JSON.stringify(payload)}\n`, { encoding: "utf8", mode: 0o600 });
    const output = runWrangler([
      "versions", "upload", "--config", configPath, "--keep-vars",
      "--var", `WORKER_VERSION_ID:${versionIds.server}`,
      "--var", `MEDIA_WORKER_VERSION_ID:${versionIds.media}`,
      "--var", `ADMIN_WORKER_VERSION_ID:${versionIds.admin}`,
      "--secrets-file", secretsPath,
      "--message", "HairFit-V2-router-auth-sync",
    ]);
    const uploadedVersion = output.match(/Worker Version ID:\s*([0-9a-f-]+)/iu)?.[1];
    if (!uploadedVersion) throw new Error("Router upload succeeded without a parseable version ID");
    console.log(`router auth secrets registered: ${ROUTER_AUTH_SECRET_NAMES.length}/${ROUTER_AUTH_SECRET_NAMES.length}`);
    console.log(`router version uploaded: ${uploadedVersion}`);
    console.log("router version deployed: no");
    console.log("secret values rendered: no");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
