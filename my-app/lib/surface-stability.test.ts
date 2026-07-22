import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const surface = read("../components/ui/Surface.tsx");
const harness = read("../components/e2e/SurfaceStabilityHarness.tsx");
const route = read("../app/e2e-harness/surfaces/page.tsx");
const css = read("../app/globals.css");

test("Surface exports element-aware polymorphic props for every family member", () => {
  assert.match(surface, /export type SurfaceProps<T extends ElementType = "div">/);
  assert.match(surface, /Omit<ComponentPropsWithoutRef<T>, keyof SurfaceOwnProps<T>>/);
  for (const component of ["AppPage", "Panel", "SurfaceCard", "InverseSection", "InverseCard"]) {
    assert.match(surface, new RegExp(`export function ${component}<T extends ElementType = "div">`));
  }
  assert.match(harness, /<AppPage[\s\S]*as="main"/);
  assert.match(harness, /<SurfaceCard[\s\S]*as="a"[\s\S]*href="#surface-inverse"/);
});

test("Surface semantic selectors live in the components layer while legacy aliases remain compatible", () => {
  const layerStart = css.indexOf("@layer components {");
  const layerEnd = css.indexOf("\n.app-chip", layerStart);
  assert.notEqual(layerStart, -1);
  assert.notEqual(layerEnd, -1);

  const beforeComponentsLayer = css.slice(0, layerStart);
  const componentsLayer = css.slice(layerStart, layerEnd);
  assert.doesNotMatch(beforeComponentsLayer, /\.c-surface/);
  for (const variant of ["page", "panel", "card", "inverse", "inverse-card"]) {
    assert.match(componentsLayer, new RegExp(`\\.c-surface\\[data-surface="${variant}"\\]`));
  }
  for (const alias of ["app-page", "app-panel", "app-card", "app-inverse", "app-inverse-card"]) {
    assert.match(beforeComponentsLayer, new RegExp(`\\.${alias}`));
  }
});

test("Surface visual harness is fail-closed outside explicit E2E builds", () => {
  assert.match(route, /process\.env\.E2E_UI_HARNESS_ENABLED !== "true"/);
  assert.match(route, /notFound\(\)/);
  assert.match(route, /<SurfaceStabilityHarness/);
});
