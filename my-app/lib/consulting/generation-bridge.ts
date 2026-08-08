import type { ConsultationPreview, FaceAnalysis } from "./contracts";

interface GenerationVariant { id: string; label: string; reason: string; outputUrl?: string | null; generatedImagePath?: string | null; status?: string }
interface GenerationResponse { error?: string; recommendationSet?: { variants?: GenerationVariant[]; analysis?: { faceShape?: string; balance?: string; hairline?: string; hairDensity?: string } } }

export async function loadGenerationConsultationBridge(generationId: string) {
  const response = await fetch(`/api/generations/${encodeURIComponent(generationId)}`, { cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as GenerationResponse;
  if (!response.ok) throw new Error(data.error || "generation 결과를 불러오지 못했습니다.");
  const variants = data.recommendationSet?.variants ?? [];
  const axes = ["BALANCE", "IMAGE", "LIFESTYLE"] as const;
  const previews: ConsultationPreview[] = Array.from({ length: 9 }, (_, index) => {
    const variant = variants[index];
    const axis = axes[Math.floor(index / 3)];
    return {
      id: variant?.id || `${axis.toLowerCase()}-${(index % 3) + 1}`,
      axis,
      label: variant?.label || `${axis} ${(index % 3) + 1}`,
      reason: variant?.reason || "아직 generation 결과가 도착하지 않았습니다.",
      imageUrl: variant?.outputUrl || null,
      generatedImagePath: variant?.generatedImagePath || null,
      status: variant?.outputUrl ? "accepted" : variant?.status === "failed" ? "failed" : "pending",
      sourceVariantId: variant?.id || null,
    };
  });
  const analysis = data.recommendationSet?.analysis;
  const faceAnalysis: FaceAnalysis | null = analysis ? {
    faceShape: analysis.faceShape || "확인 전", balance: analysis.balance || "확인 전",
    hairline: analysis.hairline || "확인 전", density: analysis.hairDensity || "확인 전", confidence: "medium",
  } : null;
  return { previews, faceAnalysis };
}
