export type DiscoveryStatus = "draft" | "review" | "published" | "retired";

export type DiscoveryPageId =
  | "D-AI-SIM"
  | "D-FACE"
  | "D-MEN"
  | "D-WOMEN"
  | "D-BANGS"
  | "D-BOB"
  | "D-SALON";

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
  kind: "simulation-map" | "face-observation" | "men-grooming" | "women-length" | "bangs-risk" | "bob-cut-ladder" | "salon-brief";
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
}

export interface DiscoverySampleManifest {
  id: string;
  status: "approved" | "review" | "revoked";
  sourceAssetId: string;
  ogAssetId: string;
  reviewedAt: string;
  owner: string;
  provenanceRef: string;
  assets: readonly DiscoverySampleAsset[];
  strategies: readonly {
    id: DiscoveryStrategyId;
    label: string;
    description: string;
    assetIds: readonly [string, string, string];
  }[];
}

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
