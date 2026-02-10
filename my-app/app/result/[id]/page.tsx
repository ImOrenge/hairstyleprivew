"use client";

import { useEffect, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ActionToolbar } from "../../../components/result/ActionToolbar";
import { ComparisonView } from "../../../components/result/ComparisonView";
import { FeedbackModal } from "../../../components/result/FeedbackModal";
import { useGenerationStore } from "../../../store/useGenerationStore";

export default function ResultPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const id = params?.id || "unknown";

  const previewUrl = useGenerationStore((state) => state.previewUrl);
  const latestOutputUrl = useGenerationStore((state) => state.latestOutputUrl);
  const latestPredictionId = useGenerationStore((state) => state.latestPredictionId);
  const hydrateOriginalImage = useGenerationStore((state) => state.hydrateOriginalImage);

  useEffect(() => {
    void hydrateOriginalImage();
  }, [hydrateOriginalImage]);

  const outputFromQuery = searchParams.get("output");
  const isSamePrediction = latestPredictionId === id;

  const beforeImage = previewUrl || "https://placehold.co/900x1200?text=Original";
  const afterImage =
    (isSamePrediction ? latestOutputUrl : null) ||
    outputFromQuery ||
    "https://placehold.co/900x1200?text=Generated";

  const hasRealOutput = useMemo(
    () =>
      Boolean(
        afterImage &&
          !afterImage.includes("placehold.co/900x1200?text=Generated"),
      ),
    [afterImage],
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-5 px-4 py-8 sm:px-6">
      <header className="w-full max-w-2xl space-y-1 text-center">
        <h1 className="text-2xl font-bold">결과 확인</h1>
        <p className="text-sm text-gray-600">Generation ID: {id}</p>
      </header>

      {!hasRealOutput ? (
        <p className="w-full max-w-2xl rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-800">
          생성 결과 URL이 아직 없습니다. 생성이 진행 중이거나 실패했을 수 있습니다.
        </p>
      ) : null}

      <ComparisonView beforeImage={beforeImage} afterImage={afterImage} />

      <div className="flex w-full max-w-2xl justify-center">
        <ActionToolbar id={id} outputImageUrl={hasRealOutput ? afterImage : null} />
      </div>
      <div className="flex w-full max-w-2xl justify-center">
        <FeedbackModal generationId={id} />
      </div>
    </div>
  );
}
