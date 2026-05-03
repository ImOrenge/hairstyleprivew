import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const envFiles = [
  path.join(root, "my-app", ".env.Local"),
  path.join(root, "my-app", ".env.local"),
  path.join(root, "my-app", ".env"),
];

function readEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
        return [key, value];
      }),
  );
}

const fileEnv = Object.assign({}, ...envFiles.map(readEnvFile));
const env = { ...process.env };

env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||=
  fileEnv.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || fileEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";
env.EXPO_PUBLIC_API_BASE_URL ||= fileEnv.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3000";

const expoCli = path.join(root, "node_modules", "expo", "bin", "cli");
const child = spawn(process.execPath, [expoCli, "start", ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }
  process.exit(code ?? 0);
});
