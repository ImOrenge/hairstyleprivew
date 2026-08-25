import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function productionTypeScriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(candidate);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return [candidate];
  });
}

test("Cloudflare Worker modules never import sharp during startup", () => {
  const files = ["app", "lib"].flatMap((directory) => productionTypeScriptFiles(path.resolve(directory)));
  const eagerImports = files.filter((file) => /^import\s+.+\s+from\s+["']sharp["'];?$/m.test(readFileSync(file, "utf8")));

  assert.deepEqual(eagerImports, []);
  assert.match(readFileSync(path.resolve("lib/sharp-loader.ts"), "utf8"), /import\("sharp"\)/);
});
