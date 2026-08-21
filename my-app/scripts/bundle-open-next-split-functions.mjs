import { existsSync, renameSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

function assertInsideFunctionsRoot(candidate) {
  const relative = path.relative(functionsRoot, path.resolve(candidate));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("INVALID_OPEN_NEXT_FUNCTION_PATH");
  }
}

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
