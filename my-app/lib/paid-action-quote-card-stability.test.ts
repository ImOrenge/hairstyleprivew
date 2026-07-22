import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const component = read("../components/billing/PaidActionQuoteCard.tsx");
const globals = read("../app/globals.css");
const harness = read("../components/e2e/PaidActionQuoteHarness.tsx");
const page = read("../app/e2e-harness/paid-action-quote/page.tsx");

test("PaidActionQuoteCard publishes explicit fail-closed state and labelled section contracts", () => {
  for (const state of [
    "loading",
    "unavailable",
    "ready",
    "free",
    "expired",
    "insufficient",
    "error",
  ]) {
    assert.match(component, new RegExp(`\\|? "${state}"`));
  }
  assert.match(component, /as="section"/);
  assert.match(component, /aria-labelledby=\{titleId\}/);
  assert.match(component, /aria-describedby=\{summaryId\}/);
  assert.match(component, /aria-busy=\{loading\}/);
  assert.match(component, /data-allowed=/);
  assert.match(component, /data-state=\{state\}/);
  assert.equal(component.match(/role="status"/g)?.length, 1);
});

test("PaidActionQuoteCard owns a tokenized global CSS namespace and one refresh position", () => {
  assert.match(component, /className="c-paid-action-quote"/);
  assert.match(component, /className="c-paid-action-quote__refresh"/);
  assert.match(component, /className="c-paid-action-quote__metrics"/);
  assert.match(component, /className="c-paid-action-quote__notice"/);
  assert.match(globals, /\.c-paid-action-quote\s*\{/);
  assert.match(globals, /\.c-paid-action-quote\[data-state="expired"\]/);
  assert.match(globals, /\.c-paid-action-quote__metrics\s*\{/);
  assert.equal(component.match(/onClick=\{onRefresh\}/g)?.length, 1);
});

test("paid-action quote E2E harness stays fail-closed and composes the production component", () => {
  assert.match(page, /process\.env\.E2E_UI_HARNESS_ENABLED !== "true"/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(harness, /import \{ PaidActionQuoteCard \} from "\.\.\/billing\/PaidActionQuoteCard"/);
  assert.match(harness, /<PaidActionQuoteCard/);
  assert.match(harness, /quoteScenarios/);
});
