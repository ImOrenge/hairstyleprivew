import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? appRoot,
    env: options.env ?? process.env,
    encoding: "utf8",
    shell: false,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
}

function capture(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
  return result.stdout.trim();
}

export function assertDeploymentId(value) {
  if (!/^[0-9a-f]{40}$/u.test(value)) {
    throw new Error("Cloudflare OpenNext build requires a 40-character Git SHA deployment ID");
  }
  return value;
}

export function deploymentBuildEnv(baseEnv, deploymentId) {
  return { ...baseEnv, NEXT_DEPLOYMENT_ID: assertDeploymentId(deploymentId) };
}

export function deploymentMarker(deploymentId) {
  const value = assertDeploymentId(deploymentId);
  return { sourceRevision: value, deploymentId: value };
}

function main() {
  const deploymentId = assertDeploymentId(capture("git", ["rev-parse", "HEAD"], repoRoot));
  const openNextCli = resolve(repoRoot, "node_modules", "@opennextjs", "cloudflare", "dist", "cli", "index.js");
  run(process.execPath, [openNextCli, "build"], {
    env: deploymentBuildEnv(process.env, deploymentId),
  });
  writeFileSync(
    resolve(appRoot, ".open-next", "hairfit-deployment.json"),
    `${JSON.stringify(deploymentMarker(deploymentId), null, 2)}\n`,
    "utf8",
  );
  console.log(`[cf:build] deploymentId=${deploymentId}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`[cf:build] failed: ${error.message}`);
    process.exitCode = 1;
  }
}
