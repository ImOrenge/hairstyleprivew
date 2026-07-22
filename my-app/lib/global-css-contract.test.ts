import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const css = read("../app/globals.css");
const button = read("../components/ui/Button.tsx");
const surface = read("../components/ui/Surface.tsx");
const dialog = read("../components/ui/Dialog.tsx");
const inlineAlert = read("../components/ui/InlineAlert.tsx");
const formField = read("../components/ui/FormField.tsx");
const pointerGlow = read("../components/providers/PointerGlowProvider.tsx");
const contract = read("../../docs/components/global-css-contract.md");

test("semantic primitives expose stable variant, tone, state, and ARIA contracts", () => {
  assert.match(button, /className=\{buttonClassName/);
  assert.match(button, /data-variant=\{variant\}/);
  assert.match(button, /const state = loading \? "loading" : isDisabled \? "disabled" : "enabled"/);
  assert.match(button, /data-state=\{state\}/);
  assert.match(button, /disabled=\{isDisabled\}/);
  assert.match(surface, /className=\{cn\("c-surface"/);
  assert.match(surface, /data-surface=\{surface\}/);
  assert.match(dialog, /data-state="open"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(inlineAlert, /data-tone=\{tone\}/);
  assert.match(inlineAlert, /data-state="visible"/);
  assert.match(formField, /data-state=\{state\}/);
  assert.match(formField, /"aria-errormessage": errorId/);
});

test("pointer glow discovers semantic surfaces without app or hf class coupling", () => {
  assert.ok(pointerGlow.includes('[data-pointer-glow="surface"]'));
  assert.doesNotMatch(pointerGlow, /\.app-|\.hf-/);
  assert.match(surface, /data-pointer-glow=\{supportsPointerGlow \? "surface" : undefined\}/);
  assert.match(css, /:where\(\[data-pointer-glow="surface"\]\)/);
});

test("only usage-zero legacy selectors are absent from runtime styles", () => {
  const runtimeSources = `${css}\n${pointerGlow}`;
  for (const selector of [
    "app-panel-muted",
    "app-card-plain",
    "app-inverse-card-strong",
    "app-status",
  ]) {
    assert.equal(runtimeSources.includes(selector), false, `${selector} must stay removed`);
    assert.match(contract, new RegExp(selector));
  }
});

test("the frozen palette compatibility boundary remains unchanged", () => {
  assert.equal(css.match(/!important/g)?.length ?? 0, 42);
  assert.match(css, /\.bg-white \{[\s\S]*background-color: var\(--app-surface\) !important;/);
  assert.match(css, /\.dark \.dark\\:text-white/);
  assert.match(css, /--app-on-danger: #ffffff;/);
  assert.match(css, /color: var\(--app-on-danger\);/);
  assert.match(contract, /`!important` 42개/);
});
