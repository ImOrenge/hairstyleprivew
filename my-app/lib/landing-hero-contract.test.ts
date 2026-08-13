import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const componentPath = join(appRoot, "components", "home", "HeroSection.tsx");
const cssPath = join(appRoot, "components", "home", "HeroSection.module.css");
const landingCssPath = join(appRoot, "app", "landing.css");
const assetRoot = join(appRoot, "public", "hero", "rolling");

test("rolling hero keeps a four-column by four-row paired asset contract", () => {
  const component = readFileSync(componentPath, "utf8");
  const css = readFileSync(cssPath, "utf8");
  const landingCss = readFileSync(landingCssPath, "utf8");
  const assetRefs = Array.from(
    component.matchAll(/src:\s*"(\/hero\/rolling\/model-(\d{2})-(hair|fashion)\.webp)"/g),
  );
  const columnGroups = Array.from(
    component.matchAll(/tiles:\s*\[\.\.\.MODEL_TILES\.(model\d+),\s*\.\.\.MODEL_TILES\.(model\d+)\]/g),
  );

  assert.equal(assetRefs.length, 16, "hero must reference exactly 16 source assets");
  assert.equal(new Set(assetRefs.map((match) => match[1])).size, 16, "hero assets must be unique");
  assert.equal(columnGroups.length, 4, "hero must define exactly four rolling columns");
  assert.match(css, /grid-template-columns:\s*repeat\(4,/);
  assert.match(css, /\.visualStage\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?height:\s*100%;/);
  assert.match(css, /\.copyBlock\s*\{[\s\S]*?min-height:\s*clamp\(44rem,/);
  assert.match(css, /\.title::before\s*\{[\s\S]*?backdrop-filter:\s*blur\(7px\)/);
  assert.match(css, /color-mix\(in srgb, var\(--app-bg\) 72%, transparent\)/);
  assert.match(landingCss, /\.f-landing-hero-shell\s*\{[\s\S]*?left:\s*50%;[\s\S]*?width:\s*calc\(100% \+ var\(--landing-gutter\)\);[\s\S]*?transform:\s*translateX\(-50%\);/);

  const groupedModels = columnGroups.flatMap((match) => [match[1], match[2]]);
  assert.equal(new Set(groupedModels).size, 8, "each model pair must appear in one column only");

  for (let model = 1; model <= 8; model += 1) {
    const id = model.toString().padStart(2, "0");
    for (const kind of ["hair", "fashion"] as const) {
      const assetName = `model-${id}-${kind}.webp`;
      const assetPath = join(assetRoot, assetName);
      assert.equal(existsSync(assetPath), true, `${assetName} is missing`);
      assert.ok(statSync(assetPath).size > 10_000, `${assetName} is unexpectedly small`);
      const header = readFileSync(assetPath).subarray(0, 12);
      assert.equal(header.subarray(0, 4).toString("ascii"), "RIFF", `${assetName} is not RIFF WebP`);
      assert.equal(header.subarray(8, 12).toString("ascii"), "WEBP", `${assetName} is not WebP`);
    }
  }
});
