import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const appRoot = process.cwd();

function listTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listTsxFiles(absolutePath);
    }
    return entry.isFile() && entry.name.endsWith(".tsx") ? [absolutePath] : [];
  });
}

function relativePath(filePath: string) {
  return path.relative(appRoot, filePath).replaceAll("\\", "/");
}

test("the web app has one root main landmark and no delegated nested main", () => {
  const sourceFiles = [
    ...listTsxFiles(path.join(appRoot, "app")),
    ...listTsxFiles(path.join(appRoot, "components")),
  ];

  const literalMainFiles = sourceFiles
    .filter((filePath) => /<main\b/.test(readFileSync(filePath, "utf8")))
    .map(relativePath)
    .sort();
  const delegatedMainFiles = sourceFiles
    .filter((filePath) => /\bas\s*=\s*(?:["']main["']|\{\s*["']main["']\s*\})/.test(readFileSync(filePath, "utf8")))
    .map(relativePath)
    .sort();

  assert.deepEqual(literalMainFiles, ["app/layout.tsx"]);
  assert.deepEqual(delegatedMainFiles, []);
});

test("the keyboard skip link targets the focusable root main", () => {
  const layout = readFileSync(path.join(appRoot, "app", "layout.tsx"), "utf8");
  const skipLink = '<a href="#main-content" className="c-skip-link">';
  const rootMain = '<main id="main-content" tabIndex={-1}>';

  assert.ok(layout.includes(skipLink));
  assert.ok(layout.includes(rootMain));
  assert.ok(layout.indexOf(skipLink) < layout.indexOf(rootMain));
});
