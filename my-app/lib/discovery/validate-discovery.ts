import type {
  DiscoveryEvidenceEntry,
  DiscoveryFinding,
  DiscoveryPageDefinition,
  DiscoverySampleManifest,
} from "./types.ts";

interface DiscoveryRegistryInput {
  pages: readonly DiscoveryPageDefinition[];
  sampleManifests: readonly DiscoverySampleManifest[];
  evidence: readonly DiscoveryEvidenceEntry[];
}

const forbiddenSourceClaims = ["실제 시술과 동일", "100% 어울림", "실패 없음", "정확도 보장"];

export function validateDiscoveryRegistry({ pages, sampleManifests, evidence }: DiscoveryRegistryInput) {
  const findings: DiscoveryFinding[] = [];
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  const seenCanonicals = new Set<string>();
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const manifestById = new Map(sampleManifests.map((manifest) => [manifest.id, manifest]));
  const evidenceById = new Map(evidence.map((entry) => [entry.id, entry]));

  for (const page of pages) {
    for (const [kind, value, seen] of [
      ["ID", page.id, seenIds],
      ["slug", page.slug, seenSlugs],
      ["canonical", page.seo.canonicalPath, seenCanonicals],
    ] as const) {
      if (seen.has(value)) {
        findings.push(finding(`duplicate-${kind.toLowerCase()}-${value}`, "P0", "content", `${kind}가 중복되었습니다.`, value, `${kind}를 고유하게 변경합니다.`));
      }
      seen.add(value);
    }

    if (page.seo.canonicalPath !== `/discover/${page.slug}`) {
      findings.push(finding(`canonical-${page.id}`, "P0", "seo", "canonical path와 slug가 일치하지 않습니다.", page.seo.canonicalPath, `canonicalPath를 /discover/${page.slug}로 변경합니다.`));
    }
    if (!Number.isFinite(Date.parse(page.updatedAt))) {
      findings.push(finding(`updated-at-${page.id}`, "P1", "seo", "updatedAt이 유효한 ISO 날짜가 아닙니다.", page.updatedAt, "검증된 콘텐츠 변경일을 ISO 형식으로 기록합니다."));
    }
    if (page.message.primaryCta.href !== "/consulting/new" || page.message.finalCta.href !== "/consulting/new") {
      findings.push(finding(`cta-${page.id}`, "P0", "conversion", "공개 CTA가 허용된 상담 진입 경로가 아닙니다.", `${page.message.primaryCta.href}, ${page.message.finalCta.href}`, "CTA를 /consulting/new로 연결합니다."));
    }
    for (const relatedId of page.relatedPageIds) {
      const related = pageById.get(relatedId);
      if (relatedId === page.id || !related || related.status !== "published") {
        findings.push(finding(`related-${page.id}-${relatedId}`, "P1", "routing", "related page가 자기 자신이거나 공개 페이지가 아닙니다.", relatedId, "공개된 다른 페이지 ID만 참조합니다."));
      }
    }

    const searchableCopy = JSON.stringify(page);
    for (const claim of forbiddenSourceClaims) {
      if (searchableCopy.includes(claim) && !page.message.forbiddenClaims.includes(claim)) {
        findings.push(finding(`forbidden-${page.id}-${claim}`, "P0", "content", "금지 주장이 페이지 콘텐츠에 포함되었습니다.", claim, "보장 표현을 제거하고 결과 한계를 설명합니다."));
      }
    }

    if (page.status !== "published") continue;
    if (!page.seo.index || page.faq.length === 0 || !page.sampleManifestId || page.evidenceIds.length === 0) {
      findings.push(finding(`published-required-${page.id}`, "P0", "content", "published 페이지의 필수 공개 필드가 비어 있습니다.", page.id, "index, FAQ, sample, evidence를 모두 채웁니다."));
      continue;
    }
    const manifest = manifestById.get(page.sampleManifestId);
    if (!manifest || manifest.status !== "approved") {
      findings.push(finding(`manifest-${page.id}`, "P0", "asset", "published 페이지가 승인 sample manifest를 참조하지 않습니다.", page.sampleManifestId, "approved manifest를 연결합니다."));
    } else {
      validateManifest(manifest, findings);
    }
    for (const evidenceId of page.evidenceIds) {
      const entry = evidenceById.get(evidenceId);
      if (!entry || entry.status !== "verified" || Date.parse(entry.expiresAt) <= Date.parse(page.updatedAt)) {
        findings.push(finding(`evidence-${page.id}-${evidenceId}`, "P0", "evidence", "published 페이지가 유효한 verified evidence를 참조하지 않습니다.", evidenceId, "유효한 evidence를 연결하거나 페이지를 review로 내립니다."));
      }
    }
  }

  return findings;
}

function validateManifest(manifest: DiscoverySampleManifest, findings: DiscoveryFinding[]) {
  const sourceAssets = manifest.assets.filter((asset) => asset.role === "source");
  const previewAssets = manifest.assets.filter((asset) => asset.role === "preview");
  const ogAssets = manifest.assets.filter((asset) => asset.role === "og");
  const assetById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  if (sourceAssets.length !== 1 || previewAssets.length !== 9 || ogAssets.length !== 1 || manifest.strategies.length !== 3) {
    findings.push(finding(`manifest-count-${manifest.id}`, "P0", "asset", "sample은 source 1개, preview 9개, OG 1개, strategy 3개여야 합니다.", `${sourceAssets.length}/${previewAssets.length}/${ogAssets.length}/${manifest.strategies.length}`, "manifest asset 수를 계약에 맞춥니다."));
  }
  for (const strategy of manifest.strategies) {
    if (strategy.assetIds.length !== 3 || strategy.assetIds.some((assetId) => assetById.get(assetId)?.role !== "preview")) {
      findings.push(finding(`strategy-${manifest.id}-${strategy.id}`, "P0", "asset", "각 strategy는 정확히 세 preview를 참조해야 합니다.", strategy.assetIds.join(","), "preview asset ID 세 개를 연결합니다."));
    }
  }
  for (const asset of manifest.assets) {
    if (asset.status !== "approved" || !asset.alt || !asset.width || !asset.height || !asset.bytes || !asset.licenseRef || !asset.consentRef) {
      findings.push(finding(`asset-${manifest.id}-${asset.id}`, "P0", "asset", "sample asset 승인 또는 필수 메타데이터가 부족합니다.", asset.id, "status, dimension, bytes, alt, license, consent를 채웁니다."));
    }
    if (asset.personId !== sourceAssets[0]?.personId && asset.role === "preview") {
      findings.push(finding(`continuity-${manifest.id}-${asset.id}`, "P0", "asset", "preview와 source의 personId가 일치하지 않습니다.", `${sourceAssets[0]?.personId}/${asset.personId}`, "같은 continuity set의 asset만 사용합니다."));
    }
  }
}

function finding(
  id: string,
  priority: DiscoveryFinding["priority"],
  area: DiscoveryFinding["area"],
  message: string,
  evidence: string,
  fix: string,
): DiscoveryFinding {
  return { id, priority, area, message, evidence, fix };
}
