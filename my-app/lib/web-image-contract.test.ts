import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = [join(appRoot, "app"), join(appRoot, "components")];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return entry.name.endsWith(".tsx") ? [absolute] : [];
  });
}

function isAftercareOwned(file: string) {
  const normalized = relative(appRoot, file).replaceAll("\\", "/");
  return /(^|\/)aftercare(\/|\.tsx$)/i.test(normalized) || /Aftercare/.test(normalized);
}

function attributeValue(
  element: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  name: string,
) {
  const attribute = element.attributes.properties.find(
    (candidate): candidate is ts.JsxAttribute =>
      ts.isJsxAttribute(candidate) && candidate.name.getText() === name,
  );
  if (!attribute) return null;
  if (!attribute.initializer) return true;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  return attribute.initializer.getText();
}

function hasReservedLayout(node: ts.Node, sourceFile: ts.SourceFile) {
  let current = node.parent;
  for (let depth = 0; current && depth < 8; depth += 1, current = current.parent) {
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) {
      const opening = ts.isJsxElement(current) ? current.openingElement : current;
      const className = attributeValue(opening, "className");
      const layoutText = typeof className === "string" ? className : opening.getText(sourceFile);
      if (/aspect-(?:\[|square|video)|min-h-\[|\$\{aspect\}/.test(layoutText)) return true;
    }
  }
  return false;
}

interface AuditedImage {
  file: string;
  kind: "next-image" | "raw-img";
  line: number;
}

function auditImages() {
  const images: AuditedImage[] = [];
  const failures: string[] = [];

  for (const file of sourceRoots.flatMap(sourceFiles).filter((candidate) => !isAftercareOwned(candidate))) {
    const source = readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const nextImageNames = new Set<string>();

    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.getText(sourceFile) !== '"next/image"') {
        continue;
      }
      const localName = statement.importClause?.name?.text;
      if (localName) nextImageNames.add(localName);
    }

    function visit(node: ts.Node) {
      if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
        const tagName = node.tagName.getText(sourceFile);
        const kind = tagName === "img" ? "raw-img" : nextImageNames.has(tagName) ? "next-image" : null;
        if (kind) {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
          const location = `${relative(appRoot, file).replaceAll("\\", "/")}:${line}`;
          images.push({ file: location, kind, line });

          if (attributeValue(node, "alt") === null) failures.push(`${location} is missing alt`);
          if (attributeValue(node, "src") === null) failures.push(`${location} is missing src`);

          if (kind === "raw-img") {
            if (attributeValue(node, "decoding") !== "async") {
              failures.push(`${location} must use decoding=async`);
            }
            const loading = attributeValue(node, "loading");
            const priority = attributeValue(node, "fetchPriority");
            if (loading !== "lazy" && loading !== "eager" && priority !== "high") {
              failures.push(`${location} must declare lazy/eager loading or high fetch priority`);
            }
            if (!hasReservedLayout(node, sourceFile)) {
              failures.push(`${location} must be inside an aspect-ratio or min-height reservation`);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  return { failures, images };
}

test("non-aftercare web images keep explicit descriptions and loading policy", () => {
  const { failures, images } = auditImages();
  const rawImages = images.filter((image) => image.kind === "raw-img");
  const nextImages = images.filter((image) => image.kind === "next-image");

  assert.deepEqual(failures, []);
  assert.equal(rawImages.length, 13, "raw image inventory changed; review loading and layout policy");
  assert.equal(nextImages.length, 12, "next/image inventory changed; review alt coverage");
});
