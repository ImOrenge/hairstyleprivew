#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "..");
const rootMigrationsDir = resolve(repoRoot, "supabase", "migrations");
const appMigrationsDir = resolve(appDir, "supabase", "migrations");

function migrationNames(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
}

function normalizedMigration(path) {
  return readFileSync(path, "utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trimEnd();
}

const rootNames = migrationNames(rootMigrationsDir);
const appNames = migrationNames(appMigrationsDir);
const rootSet = new Set(rootNames);
const appSet = new Set(appNames);
const failures = [];

for (const name of appNames) {
  if (!rootSet.has(name)) failures.push(`missing from root: ${name}`);
}
for (const name of rootNames) {
  if (!appSet.has(name)) failures.push(`missing from my-app: ${name}`);
}
for (const name of rootNames.filter((candidate) => appSet.has(candidate))) {
  const rootSource = normalizedMigration(resolve(rootMigrationsDir, name));
  const appSource = normalizedMigration(resolve(appMigrationsDir, name));
  if (rootSource !== appSource) failures.push(`content mismatch: ${name}`);
}

if (failures.length > 0) {
  console.error("Supabase migration mirror check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Supabase migration mirror check passed (${rootNames.length} migrations).`);
}
