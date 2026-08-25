import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SERVER_ROLLOUT_FLAGS,
  SERVER_ROLLOUT_SETTINGS,
} from "./set-hairfit-v2-cloudflare-off.mjs";
import {
  expectedRolloutFlagValue,
  expectedRolloutSettingValue,
} from "./verify-hairfit-v2-live-readiness.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const configPath = "my-app/workers/open-next-multi/wrangler.server.jsonc";
const modeContracts = Object.freeze({
  canary: {
    confirmation: "HAIRFIT_V2_STAFF_CANARY_UPLOAD",
    message: "HairFit-V2-staff-canary",
  },
  off: {
    confirmation: "HAIRFIT_V2_OFF_VERSION_UPLOAD",
    message: "HairFit-V2-OFF-server",
  },
  launch: {
    confirmation: "HAIRFIT_V2_LAUNCH_VERSION_UPLOAD",
    message: "HairFit-V2-launch-server",
  },
});

export function buildServerVersionPayload(mode) {
  if (!(mode in modeContracts)) throw new Error("--mode must be canary, launch, or off");
  return Object.fromEntries([
    ...SERVER_ROLLOUT_FLAGS.map((name) => [name, expectedRolloutFlagValue(mode, name)]),
    ...SERVER_ROLLOUT_SETTINGS.map((name) => [name, expectedRolloutSettingValue(mode, name)]),
  ]);
}

export function buildStaffCanaryPayload() {
  return buildServerVersionPayload("canary");
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
  const mode = argumentValue("--mode");
  const contract = modeContracts[mode];
  if (!contract) throw new Error("--mode must be canary, launch, or off");
  if (!apply) {
    console.log(`HairFit V2 ${mode} server version upload plan`);
    console.log(`server rollout flags: ${SERVER_ROLLOUT_FLAGS.length}`);
    console.log(`target true flags: ${Object.values(buildServerVersionPayload(mode)).filter((value) => value === "true").length}`);
    console.log(`target false flags: ${Object.values(buildServerVersionPayload(mode)).filter((value) => value === "false").length}`);
    console.log(`marketing email delivery mode: ${expectedRolloutSettingValue(mode, "MARKETING_EMAIL_DELIVERY_MODE")}`);
    console.log("production traffic changed: no");
    console.log("secret values rendered: no");
    process.exit(0);
  }
  if (argumentValue("--confirm") !== contract.confirmation) {
    throw new Error(`--apply requires --confirm=${contract.confirmation}`);
  }
  const sourceRevision = argumentValue("--source-revision");
  if (!/^[0-9a-f]{40}$/iu.test(sourceRevision)) {
    throw new Error("--apply requires --source-revision=<40-character Git SHA>");
  }

  const tempRoot = mkdtempSync(resolve(tmpdir(), `hairfit-v2-${mode}-version-`));
  const secretsPath = resolve(tempRoot, "secrets.json");
  try {
    writeFileSync(secretsPath, `${JSON.stringify(buildServerVersionPayload(mode))}\n`, { encoding: "utf8", mode: 0o600 });
    const output = runWrangler([
      "versions", "upload", "--config", configPath, "--keep-vars",
      "--var", `HAIRFIT_SOURCE_REVISION:${sourceRevision}`,
      "--secrets-file", secretsPath,
      "--message", contract.message,
    ]);
    const uploadedVersion = output.match(/Worker Version ID:\s*([0-9a-f-]+)/iu)?.[1];
    if (!uploadedVersion) throw new Error("Server upload succeeded without a parseable version ID");
    console.log(`${mode} server flags registered: ${SERVER_ROLLOUT_FLAGS.length}/${SERVER_ROLLOUT_FLAGS.length}`);
    console.log(`${mode} server settings registered: ${SERVER_ROLLOUT_SETTINGS.length}/${SERVER_ROLLOUT_SETTINGS.length}`);
    console.log(`server version uploaded: ${uploadedVersion}`);
    console.log("server version deployed: no");
    console.log("production traffic changed: no");
    console.log("secret values rendered: no");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
