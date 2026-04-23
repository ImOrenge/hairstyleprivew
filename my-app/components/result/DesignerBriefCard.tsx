"use client";

import { useState } from "react";
import Image from "next/image";
import type {
  FaceAnalysisSummary,
  GeneratedVariant,
  HairDesignerBrief,
} from "../../lib/recommendation-types";

interface DesignerBriefCardProps {
  variant: GeneratedVariant | null;
  analysis: FaceAnalysisSummary | null;
  imageUrl: string;
  hasRealOutput: boolean;
}

function buildFallbackBrief(
  variant: GeneratedVariant | null,
  analysis: FaceAnalysisSummary | null,
): HairDesignerBrief {
  if (!variant) {
    return {
      headline: "선택된 헤어스타일이 없습니다",
      consultationSummary: "완성된 3x3 카드 중 하나를 선택하면 디자이너 상담용 브리프가 표시됩니다.",
      cutDirection: "선택된 스타일이 없어 컷 방향을 확정할 수 없습니다.",
      volumeTextureDirection: "선택된 스타일이 없어 볼륨과 텍스처 방향을 확정할 수 없습니다.",
      stylingDirection: "완성된 결과를 선택한 뒤 상담 화면으로 사용해 주세요.",
      cautionNotes: ["완성되지 않은 카드는 디자이너 상담용 기준으로 사용하지 마세요."],
      salonKeywords: ["상담 대기"],
    };
  }

  const focusLabel =
    variant.correctionFocus === "jawline"
      ? "턱선 밸런스"
      : variant.correctionFocus === "temple"
        ? "사이드 밸런스"
        : "정수리 볼륨";
  const lengthLabel =
    variant.lengthBucket === "short" ? "짧은 기장" : variant.lengthBucket === "medium" ? "중간 기장" : "긴 기장";

  return {
    headline: `${variant.label} 디자이너 브리프`,
    consultationSummary: `${analysis?.faceShape || "현재 얼굴형"}과 ${analysis?.balance || "전체 비율"}을 기준으로 ${variant.label}을 상담합니다. ${variant.reason}`,
    cutDirection: `${lengthLabel}을 기준으로 얼굴선이 답답해 보이지 않도록 라인과 레이어를 조절해 주세요.`,
    volumeTextureDirection: `${focusLabel}을 중심으로 볼륨을 설계하고, 질감은 과하지 않게 자연스럽게 정리해 주세요.`,
    stylingDirection: "드라이 후 손질이 쉬운 방향으로 마무리하고, 가벼운 제품으로 형태만 고정해 주세요.",
    cautionNotes:
      analysis?.avoidNotes?.length
        ? analysis.avoidNotes.slice(0, 3)
        : ["얼굴 윤곽을 무겁게 만드는 과한 볼륨은 피해주세요.", "앞머리와 사이드 라인은 현장에서 비율을 보며 미세 조정해 주세요."],
    salonKeywords: Array.from(new Set([variant.label, lengthLabel, focusLabel, ...variant.tags])).slice(0, 6),
  };
}

function briefToClipboardText(variant: GeneratedVariant | null, brief: HairDesignerBrief) {
  return [
    `[HairFit 디자이너 브리프] ${variant?.label || "선택 스타일"}`,
    "",
    `상담 요약: ${brief.consultationSummary}`,
    `컷 방향: ${brief.cutDirection}`,
    `볼륨/텍스처: ${brief.volumeTextureDirection}`,
    `스타일링: ${brief.stylingDirection}`,
    `주의사항: ${brief.cautionNotes.join(" / ")}`,
    `키워드: ${brief.salonKeywords.join(", ")}`,
  ].join("\n");
}

export function DesignerBriefCard({
  variant,
  analysis,
  imageUrl,
  hasRealOutput,
}: DesignerBriefCardProps) {
  const [copied, setCopied] = useState(false);
  const brief = variant?.designerBrief || buildFallbackBrief(variant, analysis);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(briefToClipboardText(variant, brief));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-[2rem] border border-stone-900 bg-stone-950 text-white shadow-[0_30px_90px_-45px_rgba(0,0,0,0.8)]">
      <div className="grid gap-0 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="relative min-h-[280px] bg-stone-900">
          {hasRealOutput ? (
            <Image
              src={imageUrl}
              alt={variant?.label || "Selected hairstyle"}
              fill
              unoptimized
              sizes="(min-width: 1024px) 34rem, 100vw"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full min-h-[280px] items-center justify-center px-6 text-center text-sm text-stone-300">
              완성된 결과 이미지를 선택하면 디자이너에게 보여줄 이미지가 표시됩니다.
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/55">Designer Consultation</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight">{variant?.label || "Pending selection"}</h2>
          </div>
        </div>

        <div className="space-y-6 p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-200/80">Hair Directing Brief</p>
              <h3 className="mt-2 text-3xl font-black leading-tight tracking-tight">{brief.headline}</h3>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/20"
            >
              {copied ? "복사 완료" : "브리프 복사"}
            </button>
          </div>

          <p className="rounded-3xl bg-white/10 p-4 text-sm font-medium leading-7 text-stone-100">
            {brief.consultationSummary}
          </p>

          <div className="grid gap-3">
            {[
              ["컷 방향", brief.cutDirection],
              ["볼륨/텍스처", brief.volumeTextureDirection],
              ["스타일링", brief.stylingDirection],
            ].map(([label, value]) => (
              <div key={label} className="rounded-3xl border border-white/10 bg-white/[0.06] p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-200/75">{label}</p>
                <p className="mt-2 text-sm leading-6 text-stone-100">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-stone-400">Caution</p>
              <ul className="mt-3 space-y-2">
                {brief.cautionNotes.map((note, index) => (
                  <li key={`${note}-${index}`} className="rounded-2xl bg-rose-200/10 px-3 py-2 text-xs leading-5 text-rose-50">
                    {note}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-stone-400">Salon Keywords</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {brief.salonKeywords.map((keyword, index) => (
                  <span key={`${keyword}-${index}`} className="rounded-full bg-amber-200 px-3 py-1 text-xs font-black text-stone-950">
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
