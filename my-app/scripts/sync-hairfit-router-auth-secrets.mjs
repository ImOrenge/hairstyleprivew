import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/u);
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
    throw new Error("Wrangler rejected the router auth secret update");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const apply = process.argv.includes("--apply");
  const suppliedConfirmation = process.argv.find((value) => value.startsWith("--confirm="))?.slice(10) ?? "";
  if (!apply) {
    console.log(`target Worker: ${targetWorker}`);
    console.log(`router auth secrets: ${ROUTER_AUTH_SECRET_NAMES.length}`);
    console.log("secret values rendered: no");
    process.exit(0);
  }
  if (suppliedConfirmation !== confirmation) {
    throw new Error(`--apply requires --confirm=${confirmation}`);
  }

  const local = parseEnv(readFileSync(envPath, "utf8"));
  const missing = ROUTER_AUTH_SECRET_NAMES.filter((name) => !local[name]?.trim());
  if (missing.length) throw new Error(`Missing local router auth inputs: ${missing.join(", ")}`);
  const payload = Object.fromEntries(ROUTER_AUTH_SECRET_NAMES.map((name) => [name, local[name]]));
  runWrangler([
    "secret", "bulk", "--config", configPath, "--name", targetWorker,
  ], `${JSON.stringify(payload)}\n`);
  console.log(`router auth secrets registered: ${ROUTER_AUTH_SECRET_NAMES.length}/${ROUTER_AUTH_SECRET_NAMES.length}`);
  console.log("secret values rendered: no");
}
