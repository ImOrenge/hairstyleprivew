import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { discoveryPages, getPublishedDiscoveryPages } from "../lib/discovery/discovery-pages.ts";
import { discoveryEvidenceRegistry } from "../lib/discovery/evidence-registry.ts";
import { discoverySampleManifests } from "../lib/discovery/sample-manifests.ts";
import { validateDiscoveryRegistry } from "../lib/discovery/validate-discovery.ts";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = join(appRoot, "..", "artifacts", "search-discovery", "audit-report.json");
const findings = validateDiscoveryRegistry({ pages: discoveryPages, sampleManifests: discoverySampleManifests, evidence: discoveryEvidenceRegistry });

for (const manifest of discoverySampleManifests) {
  for (const asset of manifest.assets) {
    const assetPath = join(appRoot, "public", asset.path.slice(1));
    try {
      const [file, image] = await Promise.all([stat(assetPath), sharp(assetPath).metadata()]);
      if (file.size !== asset.bytes || image.width !== asset.width || image.height !== asset.height) {
        findings.push({
          id: `asset-drift-${asset.id}`,
          priority: "P0",
          area: "asset",
          message: "asset byte 또는 dimension이 manifest와 다릅니다.",
          evidence: `${asset.path}: expected ${asset.width}x${asset.height}/${asset.bytes}, actual ${image.width}x${image.height}/${file.size}`,
          fix: "검수된 실제 asset metadata로 manifest를 갱신합니다.",
        });
      }
    } catch (error) {
      findings.push({ id: `asset-missing-${asset.id}`, priority: "P0", area: "asset", message: "manifest asset을 읽을 수 없습니다.", evidence: `${asset.path}: ${String(error)}`, fix: "파일을 복구하거나 manifest 참조를 제거합니다." });
    }
  }
}

const fingerprints = new Map();
for (const page of getPublishedDiscoveryPages()) {
  for (const [kind, value] of [["title", page.seo.title], ["h1", page.message.h1], ...page.faq.map((faq) => ["faq", faq.question])]) {
    const key = `${kind}:${value}`;
    if (fingerprints.has(key)) findings.push({ id: `duplicate-fingerprint-${page.id}-${kind}`, priority: "P2", area: "content", message: `${kind} fingerprint가 다른 공개 페이지와 중복됩니다.`, evidence: `${fingerprints.get(key)} / ${page.id}: ${value}`, fix: "페이지별 primary intent에 맞게 문구를 구분합니다." });
    fingerprints.set(key, page.id);
  }
}

const blocking = findings.filter((finding) => finding.priority === "P0" || finding.priority === "P1");
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  summary: { pages: discoveryPages.length, published: getPublishedDiscoveryPages().length, findings: findings.length, blocking: blocking.length },
  publishedSlugs: getPublishedDiscoveryPages().map((page) => page.slug),
  findings,
};

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`[search-discovery] pages=${report.summary.pages} published=${report.summary.published} findings=${report.summary.findings} blocking=${report.summary.blocking}`);
console.log(`[search-discovery] report=${reportPath}`);
if (blocking.length > 0) process.exitCode = 1;
