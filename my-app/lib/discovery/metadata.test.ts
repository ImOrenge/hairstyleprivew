import assert from "node:assert/strict";
import test from "node:test";
import { discoveryPages } from "./discovery-pages.ts";
import { createDiscoveryJsonLd, serializeDiscoveryJsonLd } from "./json-ld.ts";
import { createDiscoveryMetadata } from "./metadata.ts";

test("metadata uses registry title, canonical, Open Graph and robots", () => {
  for (const page of discoveryPages) {
    const metadata = createDiscoveryMetadata(page);
    assert.deepEqual(metadata.title, { absolute: page.seo.title });
    assert.deepEqual(metadata.alternates, { canonical: page.seo.canonicalPath });
    assert.equal(metadata.openGraph?.title, page.seo.title);
    assert.equal(metadata.openGraph?.description, page.seo.description);
    assert.equal(metadata.openGraph?.url, page.seo.canonicalPath);
    assert.equal(metadata.robots && typeof metadata.robots === "object" ? metadata.robots.index : false, true);
  }
});

test("JSON-LD FAQ mirrors visible FAQ and serializer escapes script delimiters", () => {
  for (const page of discoveryPages) {
    const jsonLd = createDiscoveryJsonLd(page);
    const faqPage = jsonLd[1] as { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> };
    assert.deepEqual(faqPage.mainEntity.map((item) => ({ question: item.name, answer: item.acceptedAnswer.text })), page.faq);
  }
  assert.equal(serializeDiscoveryJsonLd({ unsafe: "</script>" }).includes("</script>"), false);
  assert.match(serializeDiscoveryJsonLd({ unsafe: "</script>" }), /\\u003c\/script>/);
});
