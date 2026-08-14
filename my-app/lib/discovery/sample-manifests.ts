import type { DiscoverySampleAsset, DiscoverySampleManifest } from "./types.ts";

export const discoverySampleManifests = [
  {
    id: "SAMPLE-D-AI-SIM-FEMALE-V2",
    status: "approved",
    sourceAssetId: "sample-female-origin",
    ogAssetId: "sample-female-board-og",
    reviewedAt: "2026-08-13",
    owner: "HairFit product design",
    provenanceRef: "docs/landing-page-editorial-image-prompts.md#continuity-set-v2",
    assets: [
      {
        id: "sample-female-origin",
        path: "/hero/demo/grid/female-01.webp",
        role: "source",
        width: 640,
        height: 800,
        bytes: 37740,
        alt: "AI 헤어 후보 비교에 사용하는 여성 원본 모델 예시",
        crop: "portrait",
        status: "approved",
        personId: "synthetic-female-continuity-v2",
        licenseRef: "internal-generated-content:landing-continuity-v2",
        consentRef: "synthetic-model:no-user-upload",
      },
      ...([
        ["01", 12506, "턱선이 또렷하게 보이는 짧은 C컬 보브"],
        ["02", 12152, "가벼운 앞머리를 더한 짧은 보브"],
        ["03", 13314, "층과 움직임을 강조한 짧은 레이어"],
        ["04", 12372, "얼굴선을 감싸는 중간 길이 C컬"],
        ["05", 14694, "차분한 볼륨의 중간 길이 레이어"],
        ["06", 13476, "가벼운 앞머리와 중간 길이 레이어"],
        ["07", 15034, "자연스러운 웨이브의 긴 레이어"],
        ["08", 18198, "질감과 볼륨을 강조한 긴 웨이브"],
        ["09", 14728, "윤곽을 길게 연결하는 차분한 롱 헤어"],
      ] as const).map(([number, bytes, description]): DiscoverySampleAsset => ({
        id: `sample-female-preview-${number}`,
        path: `/hero/demo/grid/female-v2-${number}.webp` as `/${string}`,
        role: "preview" as const,
        width: 418,
        height: 418,
        bytes: Number(bytes),
        alt: `동일한 여성 모델의 ${description} AI 헤어 후보`,
        crop: "square" as const,
        status: "approved" as const,
        personId: "synthetic-female-continuity-v2",
        licenseRef: "internal-generated-content:landing-continuity-v2",
        consentRef: "synthetic-model:no-user-upload",
      })),
      {
        id: "sample-female-board-og",
        path: "/landing/editorial/faq-preview-board-v2.webp",
        role: "og",
        width: 1536,
        height: 1024,
        bytes: 108168,
        alt: "태블릿에서 아홉 가지 AI 헤어 후보를 비교하는 HairFit 예시",
        crop: "landscape",
        status: "approved",
        personId: "synthetic-editorial-preview-board-v2",
        licenseRef: "internal-generated-content:landing-editorial-v2",
        consentRef: "synthetic-model:no-user-upload",
      },
    ],
    strategies: [
      {
        id: "BALANCE",
        label: "BALANCE",
        description: "얼굴선과 길이의 균형을 먼저 비교합니다.",
        assetIds: ["sample-female-preview-01", "sample-female-preview-02", "sample-female-preview-03"],
      },
      {
        id: "IMAGE",
        label: "IMAGE",
        description: "차분함, 선명함, 부드러움처럼 원하는 인상을 조정합니다.",
        assetIds: ["sample-female-preview-04", "sample-female-preview-05", "sample-female-preview-06"],
      },
      {
        id: "LIFESTYLE",
        label: "LIFESTYLE",
        description: "손질 시간과 일상 활용까지 고려해 후보를 좁힙니다.",
        assetIds: ["sample-female-preview-07", "sample-female-preview-08", "sample-female-preview-09"],
      },
    ],
  },
] satisfies readonly DiscoverySampleManifest[];

export function getDiscoverySampleManifest(id: string) {
  return discoverySampleManifests.find((manifest) => manifest.id === id);
}

export function getDiscoverySampleAsset(manifest: DiscoverySampleManifest, assetId: string) {
  return manifest.assets.find((asset) => asset.id === assetId);
}
