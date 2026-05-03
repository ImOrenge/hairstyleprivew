"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, ImagePlus, RefreshCw, Sparkles } from "lucide-react";
import type { PersonalColorResult } from "../../lib/fashion-types";
import { readOriginalImageFromCache, saveOriginalImageToCache } from "../../lib/uploadImageCache";
import { Button } from "../ui/Button";
import { Panel, SurfaceCard } from "../ui/Surface";
import {
  FaceScanOverlay,
  PersonalColorDiagnosisProgress,
  PersonalColorSwatchAnalysisColumn,
} from "./PersonalColorDiagnosisProgress";

type PersonalColorSource = "upload" | "mypage";

interface PersonalColorAnalyzeResponse {
  personalColor?: PersonalColorResult;
  error?: string;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

function normalizeSource(value: string | null): PersonalColorSource {
  return value === "mypage" ? "mypage" : "upload";
}

function appendQuery(path: string, key: string, value: string) {
  const [base, hash = ""] = path.split("#");
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}${hash ? `#${hash}` : ""}`;
}

function getSafeReturnTo(value: string | null, source: PersonalColorSource, nextStep: string | null) {
  const fallback = source === "mypage" ? "/mypage?tab=body-profile" : "/workspace";
  const normalized = value && value.startsWith("/") && !value.startsWith("//") ? value : fallback;

  if (source === "upload" && nextStep === "generate" && !normalized.includes("nextStep=")) {
    return appendQuery(normalized, "nextStep", "generate");
  }

  return normalized;
}

function formatTone(value?: string | null) {
  if (value === "warm") return "웜톤";
  if (value === "cool") return "쿨톤";
  if (value === "neutral") return "뉴트럴";
  return "-";
}

function formatContrast(value?: string | null) {
  if (value === "low") return "낮은 대비";
  if (value === "high") return "높은 대비";
  if (value === "medium") return "중간 대비";
  return "-";
}

function ColorSwatches({
  colors,
  emptyLabel = "저장된 색상이 없습니다.",
}: {
  colors: PersonalColorResult["bestColors"];
  emptyLabel?: string;
}) {
  if (!colors.length) {
    return <p className="text-sm text-[var(--app-muted)]">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((color) => (
        <span
          key={`${color.nameEn}-${color.hex}`}
          className="inline-flex items-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 py-1 text-xs font-bold text-[var(--app-text)]"
        >
          <span
            aria-hidden="true"
            className="h-4 w-4 rounded-full border border-black/10"
            style={{ backgroundColor: color.hex }}
          />
          {color.nameKo}
        </span>
      ))}
    </div>
  );
}

export function PersonalColorDiagnosisPageClient() {
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [personalColor, setPersonalColor] = useState<PersonalColorResult | null>(null);
  const [isLoadingCachedImage, setIsLoadingCachedImage] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const source = normalizeSource(searchParams.get("source"));
  const returnTo = useMemo(
    () => getSafeReturnTo(searchParams.get("returnTo"), source, searchParams.get("nextStep")),
    [searchParams, source],
  );
  const isUploadSource = source === "upload";

  useEffect(() => {
    let active = true;

    async function loadCachedUploadImage() {
      if (!isUploadSource) {
        return;
      }

      setIsLoadingCachedImage(true);
      const cachedFile = await readOriginalImageFromCache();
      if (!active) {
        return;
      }

      if (cachedFile) {
        setPreviewUrl(URL.createObjectURL(cachedFile));
        setImageDataUrl(await fileToDataUrl(cachedFile));
      }

      setIsLoadingCachedImage(false);
    }

    void loadCachedUploadImage();
    return () => {
      active = false;
    };
  }, [isUploadSource]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleSelectFile = async (file: File | null | undefined) => {
    if (!file || isAnalyzing) {
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl(URL.createObjectURL(file));
    setImageDataUrl(await fileToDataUrl(file));
    setPersonalColor(null);
    setError(null);

    if (isUploadSource) {
      await saveOriginalImageToCache(file);
    }
  };

  const handleAnalyze = async () => {
    if (!imageDataUrl || isAnalyzing) {
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await fetch("/api/personal-color/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceImageDataUrl: imageDataUrl }),
      });
      const data = (await response.json().catch(() => ({}))) as PersonalColorAnalyzeResponse;

      if (!response.ok || !data.personalColor) {
        throw new Error(data.error || "퍼스널컬러 진단에 실패했습니다.");
      }

      setPersonalColor(data.personalColor);
    } catch (analyzeError) {
      setError(analyzeError instanceof Error ? analyzeError.message : "퍼스널컬러 진단에 실패했습니다.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="grid gap-5">
      <Panel as="section" className="overflow-hidden p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="app-kicker">Personal Color</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--app-text)] sm:text-4xl">
              퍼스널컬러 진단
            </h1>
            <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
              얼굴 톤과 대비감을 분석해 헤어와 스타일 추천에 사용할 컬러 팔레트를 저장합니다.
            </p>
          </div>
          <Link
            href={returnTo}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-2 text-sm font-bold uppercase tracking-[0.04em] text-[var(--app-text)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-muted)]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            돌아가기
          </Link>
        </div>
      </Panel>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <Panel as="section" className="p-4 sm:p-5">
          <div className="relative aspect-[4/5] overflow-hidden border border-[var(--app-border)] bg-[var(--app-surface-muted)]">
            {previewUrl ? (
              <Image
                src={previewUrl}
                alt="퍼스널컬러 진단 얼굴 사진"
                fill
                unoptimized
                className="object-cover"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <ImagePlus className="h-10 w-10 text-[var(--app-subtle)]" aria-hidden="true" />
                <p className="text-sm font-bold text-[var(--app-text)]">
                  {isLoadingCachedImage ? "업로드 사진을 불러오는 중입니다." : "진단할 얼굴 사진을 선택하세요."}
                </p>
                <p className="text-sm leading-6 text-[var(--app-muted)]">
                  정면 얼굴이 밝게 보이는 사진이면 충분합니다.
                </p>
              </div>
            )}
            <FaceScanOverlay active={isAnalyzing} />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={isAnalyzing}
            onChange={(event) => void handleSelectFile(event.target.files?.[0])}
          />

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              variant={previewUrl ? "secondary" : "primary"}
              onClick={() => fileInputRef.current?.click()}
              disabled={isAnalyzing}
            >
              {previewUrl ? "사진 변경" : "사진 선택"}
            </Button>
            <Button
              type="button"
              onClick={handleAnalyze}
              disabled={!imageDataUrl || isAnalyzing || isLoadingCachedImage}
            >
              {isAnalyzing ? "진단 중..." : personalColor ? "다시 진단 시작" : "진단 시작"}
            </Button>
          </div>
        </Panel>

        <div className="grid content-start gap-4">
          {!personalColor ? (
            <SurfaceCard className="p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)]">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-black text-[var(--app-text)]">
                    {isUploadSource ? "업로드 사진으로 첫 진단을 진행합니다" : "마이페이지 재진단을 진행합니다"}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--app-muted)]">
                    {isUploadSource
                      ? "완료 후 결과를 확인하고 워크스페이스로 돌아가 헤어 생성 단계로 이어가세요."
                      : "완료 후 결과를 확인하고 바디 프로필 탭으로 돌아갈 수 있습니다."}
                  </p>
                </div>
              </div>
            </SurfaceCard>
          ) : null}

          {isAnalyzing ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.86fr)_320px]">
              <PersonalColorDiagnosisProgress />
              <PersonalColorSwatchAnalysisColumn />
            </div>
          ) : null}

          {error ? (
            <SurfaceCard className="border-rose-200 bg-rose-50 p-4">
              <p className="text-sm font-bold text-rose-700">{error}</p>
              <Button type="button" variant="secondary" className="mt-3" onClick={handleAnalyze} disabled={!imageDataUrl}>
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                재시도
              </Button>
            </SurfaceCard>
          ) : null}

          {personalColor ? (
            <SurfaceCard className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="app-kicker">Diagnosis Saved</p>
                  <h2 className="mt-2 text-2xl font-black text-[var(--app-text)]">
                    {formatTone(personalColor.tone)} · {formatContrast(personalColor.contrast)}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">{personalColor.summary}</p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>

              <div className="mt-5 grid gap-4">
                <div>
                  <p className="mb-2 text-xs font-bold uppercase text-[var(--app-muted)]">추천 색상</p>
                  <ColorSwatches colors={personalColor.bestColors} />
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase text-[var(--app-muted)]">피해야 할 색상</p>
                  <ColorSwatches colors={personalColor.avoidColors} />
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href={returnTo}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-4 py-2 text-sm font-bold uppercase tracking-[0.04em] text-[var(--app-inverse-text)] transition hover:bg-[var(--app-inverse-muted)]"
                >
                  {isUploadSource ? "헤어 생성으로 돌아가기" : "마이페이지로 돌아가기"}
                </Link>
                <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={isAnalyzing}>
                  다른 사진 선택
                </Button>
              </div>
            </SurfaceCard>
          ) : null}
        </div>
      </section>
    </div>
  );
}
