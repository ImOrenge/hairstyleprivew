import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPackagePath } from "../../node_modules/@opennextjs/aws/dist/build/helper.js";
import { bundleServer } from "../../node_modules/@opennextjs/cloudflare/dist/cli/build/bundle-server.js";
import {
  getNormalizedOptions,
  retrieveCompiledConfig,
} from "../../node_modules/@opennextjs/cloudflare/dist/cli/commands/utils/utils.js";

const functionNames = process.argv.slice(2);
if (functionNames.length === 0) throw new Error("OPEN_NEXT_SPLIT_FUNCTION_REQUIRED");

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (path.resolve(process.cwd()) !== appRoot) throw new Error("OPEN_NEXT_APP_ROOT_REQUIRED");

const { config } = await retrieveCompiledConfig();
const options = getNormalizedOptions(config);
const functionsRoot = path.resolve(options.outputDir, "server-functions");
const defaultDirectory = path.join(functionsRoot, "default");
const packagePath = getPackagePath(options);

function appPathsManifest(functionDirectory) {
  return path.join(functionDirectory, packagePath, ".next", "server", "app-paths-manifest.json");
}

function readManifest(functionDirectory) {
  return JSON.parse(readFileSync(appPathsManifest(functionDirectory), "utf8"));
}

function existingManifestEntries(functionDirectory) {
  const serverRoot = path.dirname(appPathsManifest(functionDirectory));
  return Object.fromEntries(Object.entries(readManifest(functionDirectory)).filter(([, relativePath]) => (
    typeof relativePath === "string" && existsSync(path.join(serverRoot, relativePath))
  )));
}

function writeManifest(functionDirectory, manifest) {
  writeFileSync(appPathsManifest(functionDirectory), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function assertInsideFunctionsRoot(candidate) {
  const relative = path.relative(functionsRoot, path.resolve(candidate));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("INVALID_OPEN_NEXT_FUNCTION_PATH");
  }
}

const splitRoutes = new Set();
for (const functionName of functionNames) {
  const functionDirectory = path.join(functionsRoot, functionName);
  for (const route of Object.keys(existingManifestEntries(functionDirectory))) splitRoutes.add(route);
}
const defaultManifest = existingManifestEntries(defaultDirectory);
for (const route of splitRoutes) delete defaultManifest[route];
writeManifest(defaultDirectory, defaultManifest);
for (const functionName of functionNames) {
  const functionDirectory = path.join(functionsRoot, functionName);
  writeManifest(functionDirectory, existingManifestEntries(functionDirectory));
}

await bundleServer(options, { minify: true });

for (const functionName of functionNames) {
  if (!/^[a-z][a-z0-9-]*$/.test(functionName) || functionName === "default") {
    throw new Error("INVALID_OPEN_NEXT_FUNCTION_NAME");
  }
  const functionDirectory = path.join(functionsRoot, functionName);
  const backupDirectory = path.join(functionsRoot, `.default-backup-${functionName}`);
  assertInsideFunctionsRoot(functionDirectory);
  assertInsideFunctionsRoot(backupDirectory);
  if (!existsSync(defaultDirectory) || !existsSync(functionDirectory) || existsSync(backupDirectory)) {
    throw new Error("INVALID_OPEN_NEXT_FUNCTION_STATE");
  }

  renameSync(defaultDirectory, backupDirectory);
  renameSync(functionDirectory, defaultDirectory);
  try {
    await bundleServer(options, { minify: true });
  } finally {
    if (existsSync(defaultDirectory) && !existsSync(functionDirectory)) {
      renameSync(defaultDirectory, functionDirectory);
    }
    if (existsSync(backupDirectory) && !existsSync(defaultDirectory)) {
      renameSync(backupDirectory, defaultDirectory);
    }
  }
  if (!existsSync(path.join(functionDirectory, "handler.mjs"))) {
    throw new Error(`OPEN_NEXT_FUNCTION_BUNDLE_MISSING:${functionName}`);
  }
}
