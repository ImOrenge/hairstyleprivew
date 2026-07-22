#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function argValue(name, fallback = "") {
  const direct = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")
    ? process.argv[index + 1]
    : fallback;
}

function localDatabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("--databaseUrl or LOCAL_DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("Workflow dispatch recovery smoke requires a PostgreSQL URL");
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("Workflow dispatch recovery smoke is restricted to a local PostgreSQL database");
  }
  return url.toString();
}

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sqlPath = resolve(
  appDir,
  "supabase",
  "tests",
  "generation_workflow_dispatch_recovery_smoke.sql",
);
const databaseUrl = localDatabaseUrl(
  argValue("databaseUrl", process.env.LOCAL_DATABASE_URL ?? ""),
);
const result = spawnSync(
  "psql",
  ["--no-psqlrc", "-v", "ON_ERROR_STOP=1", "--dbname", databaseUrl, "-f", sqlPath],
  {
    encoding: "utf8",
    env: {
      ...process.env,
      PGAPPNAME: "hairfit-generation-workflow-dispatch-recovery-smoke",
      PGSSLMODE: "disable",
    },
    maxBuffer: 4 * 1024 * 1024,
  },
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.status !== 0) {
  const detail = (result.stderr || "psql failed").trim();
  throw new Error(`Generation Workflow dispatch recovery smoke failed\n${detail}`);
}

console.log("Generation Workflow dispatch recovery smoke passed.");
