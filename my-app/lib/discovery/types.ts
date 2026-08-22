export type DiscoveryStatus = "draft" | "review" | "published" | "retired";

export type DiscoveryPageId =
  | "D-AI-SIM"
  | "D-FACE"
  | "D-MEN"
  | "D-WOMEN"
  | "D-BANGS"
  | "D-MAKEUP"
  | "D-SALON";

export type DiscoverySampleKind = "hair-grid" | "makeup-direction";

export type DiscoveryCtaId = "hero-primary" | "sample-primary" | "final-primary";

export interface DiscoveryCta {
  id: DiscoveryCtaId;
  label: string;
  href: "/consulting/new";
}

export interface DiscoveryFaq {
  question: string;
  answer: string;
}

export interface DiscoveryDecisionArtifact {
  kind: "simulation-map" | "face-observation" | "men-grooming" | "women-length" | "bangs-risk" | "makeup-direction-map" | "salon-brief";
  eyebrow: string;
  title: string;
  description: string;
  items: readonly {
    label: string;
    value: string;
    body: string;
    note: string;
  }[];
}

export type DiscoverySection =
  | {
      type: "workflow";
      eyebrow: string;
      title: string;
      description: string;
      steps: readonly { title: string; body: string }[];
    }
  | {
      type: "proof";
      eyebrow: string;
      title: string;
      description: string;
      items: readonly { label: string; value: string; evidenceId: string }[];
    }
  | {
      type: "trust";
      eyebrow: string;
      title: string;
      description: string;
      notes: readonly { title: string; body: string; evidenceId: string }[];
    }
  | {
      type: "faq";
      title: string;
    }
  | {
      type: "related";
      title: string;
    };

export interface DiscoveryPageDefinition {
  id: DiscoveryPageId;
  slug: string;
  status: DiscoveryStatus;
  pageType: "core" | "audience" | "style" | "use-case";
  intentId: string;
  audience: "b2c" | "b2b";
  locale: "ko-KR";
  updatedAt: string;
  seo: {
    title: string;
    description: string;
    canonicalPath: `/discover/${string}`;
    index: boolean;
  };
  message: {
    eyebrow: string;
    h1: string;
    support: string;
    heroNote: string;
    primaryCta: DiscoveryCta;
    sampleCta: DiscoveryCta;
    finalCta: DiscoveryCta;
    finalTitle: string;
    finalSupport: string;
    forbiddenClaims: readonly string[];
  };
  sample: {
    eyebrow: string;
    title: string;
    description: string;
    heroLinkLabel: string;
    heroCaption: string;
    note: string;
  };
  sampleKind: DiscoverySampleKind;
  artifact: DiscoveryDecisionArtifact;
  sections: readonly DiscoverySection[];
  faq: readonly DiscoveryFaq[];
  sampleManifestId: string | null;
  evidenceIds: readonly string[];
  relatedPageIds: readonly DiscoveryPageId[];
  trustPolicyVersion: string | null;
  reviewer: string;
}

export type DiscoveryAssetStatus = "approved" | "expired" | "revoked";
export type DiscoveryEvidenceStatus = "verified" | "pending" | "expired" | "revoked";
export type DiscoveryStrategyId = "BALANCE" | "IMAGE" | "LIFESTYLE";

export interface DiscoverySampleAsset {
  id: string;
  path: `/${string}`;
  role: "source" | "preview" | "og";
  width: number;
  height: number;
  bytes: number;
  alt: string;
  crop: "portrait" | "square" | "landscape";
  status: DiscoveryAssetStatus;
  personId: string;
  licenseRef: string;
  consentRef: string;
  catalogStyleSlug?: string;
  catalogNameKo?: string;
  catalogVersion?: "catalog-v4";
}

interface DiscoverySampleManifestBase {
  id: string;
  status: "approved" | "review" | "revoked";
  sourceAssetId: string;
  ogAssetId: string;
  reviewedAt: string;
  owner: string;
  provenanceRef: string;
  assets: readonly DiscoverySampleAsset[];
}

export interface DiscoveryHairSampleManifest extends DiscoverySampleManifestBase {
  sampleKind: "hair-grid";
  strategies: readonly {
    id: DiscoveryStrategyId;
    label: string;
    description: string;
    assetIds: readonly [string, string, string];
  }[];
}

export interface DiscoveryMakeupSampleManifest extends DiscoverySampleManifestBase {
  sampleKind: "makeup-direction";
  direction: {
    palettes: readonly {
      group: "recommended" | "avoid";
      label: string;
      colors: readonly { token: string; label: string; note: string }[];
    }[];
    zones: readonly { area: string; direction: string; reason: string }[];
    routine: readonly { step: string; title: string; body: string }[];
    report: { headline: string; summary: string; artistBrief: string };
  };
}

export type DiscoverySampleManifest = DiscoveryHairSampleManifest | DiscoveryMakeupSampleManifest;

export interface DiscoveryEvidenceEntry {
  id: string;
  status: DiscoveryEvidenceStatus;
  statement: string;
  sourceRef: string;
  verifiedAt: string;
  expiresAt: string;
  owner: string;
}

export interface DiscoveryFinding {
  id: string;
  priority: "P0" | "P1" | "P2" | "P3";
  area: "content" | "seo" | "asset" | "evidence" | "conversion" | "routing";
  message: string;
  evidence: string;
  fix: string;
}
