"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createConsultationPhotoCrop, createPendingPhotoDiagnostics, moveConsultationPhotoCrop } from "@hairfit/shared";
import type { PhotoCropTransform, PhotoFaceDetectionEvidence } from "@hairfit/shared";
import type { PersonalColorAssetCaptureModeV2, PersonalColorCaptureQualityV2 } from "@hairfit/shared/personal-color-v2";
import type {
  AnalysisEvidenceDraft,
  ConsultationPatch,
  ConsultationSnapshot,
  FaceAnalysis,
  PhotoQualityDiagnostic,
  PhotoSnapshot,
  StrategyRecommendation,
  StrategySnapshot,
} from "../../../lib/consulting/contracts";
import { convertImageFileToWebp, cropImageFileToWebp } from "../../../lib/webp-client";
import { uploadPersonalColorCapture } from "../../../lib/personal-color-capture-client";
import { useUpload } from "../../../hooks/useUpload";
import { Button } from "../../ui/Button";
import { ConsultationSystemData, DefinitionRows, Panel, SaveStageButton, SurfaceCard, WorkbenchGrid } from "./shared";

type DraftReceipt = {
  draftId: string;
  clientRequestId: string;
  state: "ready";
  uploadedAt: string;
  expiresAt: string;
};

type AnalysisResponse = {
  accepted?: boolean;
  requiresRetry?: boolean;
  evidence?: AnalysisEvidenceDraft;
  faceAnalysis?: FaceAnalysis;
  strategyRecommendations?: StrategyRecommendation[];
  quality?: PhotoQualityDiagnostic[];
  analyzedAt?: string;
  preflightMessage?: string;
  error?: string;
};

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("사진을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

async function stablePhotoUploadId(file: File, consultationId: string, kind: "primary" | "assist") {
  const prefix = new TextEncoder().encode(`${consultationId}:${kind}:`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const input = new Uint8Array(prefix.length + bytes.length);
  input.set(prefix);
  input.set(bytes, prefix.length);
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", input)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

export function PhotoWorkbench({ snapshot, mutate, saving }: {
  snapshot: ConsultationSnapshot;
  mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>;
  saving: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const assistInputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<PhotoSnapshot>(snapshot.photo);
  const [file, setFile] = useState<File | null>(null);
  const [assistFile, setAssistFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [assistPreviewUrl, setAssistPreviewUrl] = useState<string | null>(null);
  const [faceEvidence, setFaceEvidence] = useState<PhotoFaceDetectionEvidence | null>(null);
  const [assistFaceEvidence, setAssistFaceEvidence] = useState<PhotoFaceDetectionEvidence | null>(null);
  const [captureMode, setCaptureMode] = useState<PersonalColorAssetCaptureModeV2>(snapshot.photo.captureMode ?? "quick");
  const [colorQuality, setColorQuality] = useState<PersonalColorCaptureQualityV2 | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { status, message, details, validateImage, resetValidation } = useUpload();
  const assistValidation = useUpload();

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => () => {
    if (assistPreviewUrl) URL.revokeObjectURL(assistPreviewUrl);
  }, [assistPreviewUrl]);

  const queueCaptureCleanup = (captureAssetIds: Array<string | null | undefined>, reason: string) => {
    const uniqueIds = [...new Set(captureAssetIds.filter((id): id is string => Boolean(id)))];
    if (!uniqueIds.length) return;
    void Promise.allSettled(uniqueIds.map((assetId) => fetch(`/api/consultations/${encodeURIComponent(snapshot.sessionId)}/personal-color/captures/${encodeURIComponent(assetId)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    })));
  };

  const selectFile = async (selected: File) => {
    setWorking(true);
    setError(null);
    setFile(null);
    setAssistFile(null);
    setFaceEvidence(null);
    setAssistFaceEvidence(null);
    setColorQuality(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (assistPreviewUrl) URL.revokeObjectURL(assistPreviewUrl);
    setPreviewUrl(null);
    setAssistPreviewUrl(null);
    assistValidation.resetValidation();
    if (assistInputRef.current) assistInputRef.current.value = "";
    queueCaptureCleanup([photo.colorPrimaryCaptureAssetId, photo.colorAssistCaptureAssetId], "customer_reselected_primary_photo");
    setPhoto((current) => ({
      ...current,
      generationId: null,
      draftId: null,
      clientRequestId: null,
      uploadedAt: null,
      expiresAt: null,
      analysisRunId: null,
      colorPrimaryCaptureAssetId: null,
      colorAssistDraftId: null,
      colorAssistUploadedAt: null,
      colorAssistExpiresAt: null,
      colorAssistCaptureAssetId: null,
      quality: createPendingPhotoDiagnostics("사진 사전검사 중"),
    }));
    try {
      const validation = await validateImage(selected);
      if (validation.preflight) {
        setPhoto((current) => ({
          ...current,
          generationId: null,
          draftId: null,
          clientRequestId: null,
          uploadedAt: null,
          expiresAt: null,
          quality: validation.preflight?.diagnostics ?? current.quality,
        }));
      }
      setFaceEvidence(validation.signals?.face ?? null);
      if (!validation.ok) {
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      const converted = await convertImageFileToWebp(selected);
      const crop = createConsultationPhotoCrop({
        sourceWidth: validation.signals?.width ?? details.width ?? 1,
        sourceHeight: validation.signals?.height ?? details.height ?? 1,
        faceBox: validation.signals?.face.box,
      });
      const preparedPhoto: PhotoSnapshot = {
        ...photo,
        generationId: null,
        draftId: null,
        clientRequestId: null,
        uploadedAt: null,
        expiresAt: null,
        analysisRunId: null,
        colorPrimaryCaptureAssetId: null,
        colorAssistDraftId: null,
        colorAssistUploadedAt: null,
        colorAssistExpiresAt: null,
        colorAssistCaptureAssetId: null,
        capturedAt: null,
        crop,
        quality: validation.preflight?.diagnostics ?? photo.quality,
      };
      setFile(converted);
      setPreviewUrl(URL.createObjectURL(converted));
      setPhoto(preparedPhoto);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "사진을 준비하지 못했습니다.");
    } finally {
      setWorking(false);
    }
  };

  const selectAssistFile = async (selected: File) => {
    setWorking(true);
    setError(null);
    queueCaptureCleanup([photo.colorAssistCaptureAssetId], "customer_reselected_assist_photo");
    if (assistPreviewUrl) URL.revokeObjectURL(assistPreviewUrl);
    setAssistPreviewUrl(null);
    setAssistFile(null);
    setAssistFaceEvidence(null);
    setColorQuality(null);
    setPhoto((current) => ({
      ...current,
      colorAssistDraftId: null,
      colorAssistUploadedAt: null,
      colorAssistExpiresAt: null,
      colorAssistCaptureAssetId: null,
    }));
    try {
      const validation = await assistValidation.validateImage(selected);
      if (!validation.ok) throw new Error(validation.userMessage);
      setAssistFile(selected);
      setAssistFaceEvidence(validation.signals?.face ?? null);
      setAssistPreviewUrl(URL.createObjectURL(selected));
    } catch (cause) {
      if (assistInputRef.current) assistInputRef.current.value = "";
      setError(cause instanceof Error ? cause.message : "자연광 보조 사진을 준비하지 못했습니다.");
    } finally {
      setWorking(false);
    }
  };

  const setCropPosition = (axis: "x" | "y", value: number) => {
    if (!photo.crop) return;
    setPhoto((current) => ({ ...current, crop: moveConsultationPhotoCrop(photo.crop as PhotoCropTransform, { [axis]: value }) }));
  };

  const uploadDraft = async (sourceFile: File | null = file, sourcePhoto: PhotoSnapshot = photo, kind: "primary" | "assist" = "primary") => {
    if (!sourceFile) {
      const existingDraftId = kind === "primary" ? sourcePhoto.draftId : sourcePhoto.colorAssistDraftId;
      if (existingDraftId) return {
        draftId: existingDraftId,
        clientRequestId: kind === "primary" ? sourcePhoto.clientRequestId ?? existingDraftId : existingDraftId,
        state: "ready" as const,
        uploadedAt: (kind === "primary" ? sourcePhoto.uploadedAt : sourcePhoto.colorAssistUploadedAt) ?? new Date().toISOString(),
        expiresAt: (kind === "primary" ? sourcePhoto.expiresAt : sourcePhoto.colorAssistExpiresAt) ?? new Date(Date.now() + 60_000).toISOString(),
      };
      throw new Error(kind === "primary" ? "분석할 정면 사진을 먼저 선택해 주세요." : "자연광 보조 사진을 다시 선택해 주세요.");
    }
    const clientRequestId = kind === "primary" && sourcePhoto.clientRequestId
      ? sourcePhoto.clientRequestId
      : await stablePhotoUploadId(sourceFile, snapshot.sessionId, kind);
    const response = await fetch("/api/generations/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientRequestId, referenceImageDataUrl: await fileToDataUrl(sourceFile), retentionDays: sourcePhoto.retentionDays }),
    });
    const data = (await response.json().catch(() => ({}))) as Partial<DraftReceipt> & { error?: string };
    if (!response.ok || !data.draftId || !data.uploadedAt || !data.expiresAt) {
      throw new Error(data.error || "사진을 안전하게 업로드하지 못했습니다.");
    }
    return data as DraftReceipt;
  };

  const analyze = async (
    sourceFile: File | null = file,
    sourcePhoto: PhotoSnapshot = photo,
    sourceFaceEvidence: PhotoFaceDetectionEvidence | null = faceEvidence,
    sourceAssistFile: File | null = assistFile,
  ) => {
    if (!sourcePhoto.usageScopes.includes("analysis") || !sourcePhoto.usageScopes.includes("preview")) {
      setError("얼굴 분석과 헤어 프리뷰 사용 범위를 모두 선택해 주세요.");
      return;
    }
    setWorking(true);
    setError(null);
    try {
      if (!sourcePhoto.crop && sourceFile) throw new Error("분석에 사용할 사진 프레이밍을 확인해 주세요.");
      if (sourcePhoto.usageScopes.includes("personalColor") && captureMode === "precision" && !sourceAssistFile && !sourcePhoto.colorAssistCaptureAssetId) {
        throw new Error("정밀 진단에는 필터 없는 자연광 보조 사진이 필요합니다.");
      }
      const preparedFile = sourceFile && sourcePhoto.crop ? await cropImageFileToWebp(sourceFile, sourcePhoto.crop) : sourceFile;
      const receipt = await uploadDraft(preparedFile, sourcePhoto, "primary");
      let uploadedPhoto: PhotoSnapshot = {
        ...sourcePhoto,
        generationId: null,
        draftId: receipt.draftId,
        clientRequestId: receipt.clientRequestId,
        uploadedAt: receipt.uploadedAt,
        expiresAt: receipt.expiresAt,
        analysisRunId: null,
        captureMode,
      };
      setPhoto(uploadedPhoto);
      let primaryCapture = null as Awaited<ReturnType<typeof uploadPersonalColorCapture>> | null;
      let assistCapture = null as Awaited<ReturnType<typeof uploadPersonalColorCapture>> | null;
      if (sourcePhoto.usageScopes.includes("personalColor") && !preparedFile && !sourcePhoto.colorPrimaryCaptureAssetId) {
        throw new Error("컬러 진단에 사용할 정면 사진을 다시 선택해 주세요.");
      }
      if (sourcePhoto.usageScopes.includes("personalColor") && preparedFile) {
        primaryCapture = await uploadPersonalColorCapture({
          consultationId: snapshot.sessionId,
          file: preparedFile,
          role: "color_primary",
          captureMode,
          face: sourceFaceEvidence,
          clientTransform: "crop",
          retentionDays: sourcePhoto.retentionDays,
        });
        uploadedPhoto = { ...uploadedPhoto, colorPrimaryCaptureAssetId: primaryCapture.asset.id };
        setPhoto(uploadedPhoto);
      }
      if (sourcePhoto.usageScopes.includes("personalColor") && captureMode === "precision" && sourceAssistFile) {
        assistCapture = await uploadPersonalColorCapture({
          consultationId: snapshot.sessionId,
          file: sourceAssistFile,
          role: "color_secondary",
          captureMode,
          face: assistFaceEvidence,
          clientTransform: "none",
          retentionDays: sourcePhoto.retentionDays,
        });
        uploadedPhoto = { ...uploadedPhoto, colorAssistCaptureAssetId: assistCapture.asset.id };
        setPhoto(uploadedPhoto);
      }
      if (captureMode === "quick") uploadedPhoto = { ...uploadedPhoto, colorAssistCaptureAssetId: null };
      const effectiveQuality = assistCapture?.asset.quality ?? primaryCapture?.asset.quality ?? null;
      if (effectiveQuality) setColorQuality(effectiveQuality);
      const blockers = [...(primaryCapture?.asset.quality?.blockers ?? []), ...(assistCapture?.asset.quality?.blockers ?? [])];
      if (blockers.length) throw new Error(blockers.map((item) => item.message).join(" "));
      setPhoto(uploadedPhoto);
      const response = await fetch(`/api/consultations/${encodeURIComponent(snapshot.sessionId)}/photo-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: receipt.draftId, expectedVersion: snapshot.version, faceEvidence: sourceFaceEvidence, photo: uploadedPhoto }),
      });
      const data = (await response.json().catch(() => ({}))) as AnalysisResponse;
      if (response.status === 202 && data.accepted) {
        router.replace(`/consulting/${encodeURIComponent(snapshot.sessionId)}/scan?transition=analysis`);
        return;
      }
      if (data.quality) setPhoto((current) => ({ ...current, quality: data.quality ?? current.quality }));
      if (data.requiresRetry) {
        setError(data.preflightMessage || "사진 사전검사를 통과하지 못했습니다. 다른 사진을 선택해 주세요.");
        return;
      }
      if (!response.ok || !data.evidence || !data.faceAnalysis || !data.strategyRecommendations || !data.quality || !data.analyzedAt) {
        throw new Error(data.error || "사진 분석을 완료하지 못했습니다.");
      }
      const nextPhoto: PhotoSnapshot = {
        ...uploadedPhoto,
        capturedAt: data.analyzedAt,
        quality: data.quality,
      };
      setPhoto(nextPhoto);
      const recommendedStrategy: Partial<StrategySnapshot> = {};
      for (const recommendation of data.strategyRecommendations) {
        recommendedStrategy[recommendation.axis] = recommendation.recommendedValue;
      }
      const result = await mutate({
        photo: nextPhoto,
        evidence: data.evidence,
        faceAnalysis: data.faceAnalysis,
        strategyRecommendations: data.strategyRecommendations,
        strategy: { ...snapshot.strategy, ...recommendedStrategy },
        completeStage: "photo",
        currentStage: "scan",
      }) as { ok?: boolean };
      if (!result.ok) throw new Error("분석 결과를 상담 snapshot에 연결하지 못했습니다.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "사진 분석을 완료하지 못했습니다.");
    } finally {
      setWorking(false);
    }
  };

  const reset = () => {
    queueCaptureCleanup([photo.colorPrimaryCaptureAssetId, photo.colorAssistCaptureAssetId], "customer_reselected_photo");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (assistPreviewUrl) URL.revokeObjectURL(assistPreviewUrl);
    setPreviewUrl(null);
    setAssistPreviewUrl(null);
    setFile(null);
    setAssistFile(null);
    setFaceEvidence(null);
    setAssistFaceEvidence(null);
    setColorQuality(null);
    setPhoto({
      ...snapshot.photo,
      draftId: null,
      clientRequestId: null,
      uploadedAt: null,
      expiresAt: null,
      colorAssistDraftId: null,
      colorAssistUploadedAt: null,
      colorAssistExpiresAt: null,
      colorPrimaryCaptureAssetId: null,
      colorAssistCaptureAssetId: null,
      analysisRunId: null,
      captureMode: snapshot.photo.captureMode ?? "quick",
      crop: null,
      quality: createPendingPhotoDiagnostics(),
    });
    resetValidation();
    assistValidation.resetValidation();
    setCaptureMode(snapshot.photo.captureMode ?? "quick");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
    if (assistInputRef.current) assistInputRef.current.value = "";
  };

  const crop = photo.crop;
  const cropPreviewStyle = crop ? {
    width: `${100 / crop.width}%`,
    height: `${100 / crop.height}%`,
    left: `${-(crop.x / crop.width) * 100}%`,
    top: `${-(crop.y / crop.height) * 100}%`,
  } : undefined;

  return <WorkbenchGrid input={
    <Panel className="grid gap-6 p-5 sm:p-7">
      <div>
        <p className="text-sm font-black">상담용 정면 사진</p>
        <p className="mt-1 text-sm text-[var(--app-muted)]">얼굴과 헤어라인이 잘 보이는 사진을 준비해 주세요. 사진 상태를 확인한 뒤 분석 단계로 바로 이어집니다.</p>
      </div>
      <fieldset><legend className="text-sm font-black">사진 사용 범위</legend><div className="mt-2 flex flex-wrap gap-2">{[["analysis","얼굴 분석"],["preview","헤어 프리뷰"],["personalColor","컬러 진단"]].map(([scope,label]) => <button type="button" key={scope} onClick={() => setPhoto({ ...photo, usageScopes: photo.usageScopes.includes(scope) ? photo.usageScopes.filter((item) => item !== scope) : [...photo.usageScopes, scope] })} aria-pressed={photo.usageScopes.includes(scope)} className={`min-h-11 border px-4 text-sm font-black ${photo.usageScopes.includes(scope) ? "bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "bg-[var(--app-surface)]"}`}>{label}</button>)}</div></fieldset>
      {photo.usageScopes.includes("personalColor") ? <fieldset className="border-l-2 border-[var(--app-accent)] pl-4"><legend className="text-sm font-black">컬러 촬영 모드</legend><div className="mt-2 flex flex-wrap gap-2">{([[
        "quick", "빠른 진단 · 사진 1장",
      ], ["precision", "정밀 진단 · 정면+자연광 2장"]] as const).map(([mode, label]) => <button type="button" key={mode} onClick={() => { setCaptureMode(mode); setPhoto((current) => ({ ...current, captureMode: mode })); }} aria-pressed={captureMode === mode} className={`min-h-11 border px-4 text-sm font-black ${captureMode === mode ? "bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "bg-[var(--app-surface)]"}`}>{label}</button>)}</div><p className="mt-2 text-xs text-[var(--app-muted)]">정밀 진단은 정면 사진과 필터 없는 자연광 사진을 함께 확인해 조명 영향을 구분합니다.</p></fieldset> : null}
      {photo.usageScopes.includes("personalColor") && captureMode === "precision" ? <div className="grid gap-3">
        <div><p className="text-sm font-black">자연광 컬러 보조 사진 <span className="font-normal text-[var(--app-danger)]">필수</span></p><p className="mt-1 text-xs text-[var(--app-muted)]">정면 사진과 별도로 검사하며 퍼스널 컬러의 조명 영향을 교차 확인하는 데 사용합니다.</p></div>
        <label className="grid cursor-pointer gap-2 border border-dashed border-[var(--app-border-strong)] bg-[var(--app-surface)] p-4 text-center">
          <span className="text-sm font-black">자연광 사진 추가</span>
          <input ref={assistInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={working || saving} onChange={(event) => { const selected = event.target.files?.[0]; if (selected) void selectAssistFile(selected); }} />
        </label>
        {assistPreviewUrl ? <div className="grid min-h-[5rem] grid-cols-[5rem_1fr] items-center gap-3 border border-[var(--app-border)] p-3"><img src={assistPreviewUrl} alt="자연광 컬러 보조 사진 미리보기" className="aspect-square w-20 object-cover" loading="lazy" decoding="async" /><p className="text-xs text-[var(--app-muted)]">컬러 진단 보조 사진 준비됨 · 원본 경로는 공개되지 않습니다.</p></div> : null}
        <p className={`text-xs ${assistValidation.status === "error" ? "text-[var(--app-danger)]" : "text-[var(--app-muted)]"}`} role={assistValidation.status === "error" ? "alert" : undefined}>{assistValidation.message}</p>
      </div> : null}
      <label className="grid cursor-pointer gap-3 border border-dashed border-[var(--app-border-strong)] bg-[var(--app-surface)] p-5 text-center">
        <span className="text-sm font-black">정면 사진 선택</span>
        <span className="text-xs text-[var(--app-muted)]">JPG·PNG·WebP, 얼굴과 헤어라인이 모두 보이는 사진</span>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={working || saving} onChange={(event) => { const selected = event.target.files?.[0]; if (selected) void selectFile(selected); }} />
      </label>
      {previewUrl && crop ? <div className="grid gap-4 border border-[var(--app-border)] p-4">
        <div><p className="text-sm font-black">분석 프레이밍</p><p className="mt-1 text-xs text-[var(--app-muted)]">얼굴 신호를 기준으로 4:5 프레임을 먼저 맞췄습니다. 필요한 경우 가로·세로 위치만 조정하세요.</p></div>
        <div className="relative mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden bg-[var(--app-surface-muted)]"><img src={previewUrl} alt="분석할 영역 미리보기" className="absolute max-w-none" style={cropPreviewStyle} loading="eager" decoding="async" /></div>
        <label className="grid gap-2 text-xs font-bold">가로 위치<input type="range" min={0} max={Math.max(0, 1 - crop.width)} step={0.001} value={crop.x} disabled={crop.width >= 1 || working || saving} onChange={(event) => setCropPosition("x", Number(event.target.value))} /></label>
        <label className="grid gap-2 text-xs font-bold">세로 위치<input type="range" min={0} max={Math.max(0, 1 - crop.height)} step={0.001} value={crop.y} disabled={crop.height >= 1 || working || saving} onChange={(event) => setCropPosition("y", Number(event.target.value))} /></label>
        <SaveStageButton loading={working || saving} disabled={working || saving || (photo.usageScopes.includes("personalColor") && captureMode === "precision" && !assistFile && !photo.colorAssistCaptureAssetId)} onClick={() => void analyze(file, photo, faceEvidence, assistFile)}>이 프레이밍 사용</SaveStageButton>
        <p className="text-xs text-[var(--app-muted)]">프레이밍을 확정하면 분석을 별도로 다시 요청하지 않아도 Scan 대기 화면까지 자동으로 이어집니다.</p>
      </div> : null}
      <p className={`text-sm ${status === "error" ? "text-[var(--app-danger)]" : "text-[var(--app-muted)]"}`} aria-live="polite">{message}</p>
      {details.width && details.height ? <p className="text-xs text-[var(--app-muted)]">{details.width}×{details.height}px · {details.sizeMB}MB</p> : null}
      <fieldset><legend className="text-sm font-black">사진 보존 기간</legend><div className="mt-2 flex gap-2">{([1,7,30] as const).map((days) => <button type="button" key={days} onClick={() => setPhoto({ ...photo, retentionDays: days })} aria-pressed={photo.retentionDays === days} className={`min-h-11 border px-4 text-sm font-black ${photo.retentionDays === days ? "bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "bg-[var(--app-surface)]"}`}>{days}일</button>)}</div></fieldset>
      {error ? <p className="border border-[var(--app-danger)] bg-[var(--app-danger-bg)] p-3 text-sm" role="alert">{error}</p> : null}
      <div className="flex flex-wrap gap-2">{error ? <SaveStageButton loading={working || saving} disabled={!file && !photo.draftId} onClick={() => void analyze()}>자동 분석 재시도</SaveStageButton> : null}<Button type="button" variant="ghost" disabled={working || saving} onClick={reset}>다시 선택</Button></div>
    </Panel>
  } output={<>
    {colorQuality ? <SurfaceCard className="p-5"><p className="app-kicker">퍼스널 컬러 사진 확인</p><h2 className="mt-3 text-xl font-black">현재 사진으로 확인할 수 있는 범위</h2><div className="mt-4 grid gap-2 sm:grid-cols-2">{Object.entries(colorQuality.usableAxes).map(([axis, usable]) => <div key={axis} className={`border p-3 ${usable ? "border-[var(--app-success)] bg-[var(--app-success-bg)]" : "border-[var(--app-warning)] bg-[var(--app-warning-bg)]"}`}><p className="text-sm font-black">{{ temperature: "웜·쿨", value: "밝기", chroma: "선명도", contrast: "대비" }[axis as "temperature" | "value" | "chroma" | "contrast"] ?? axis}</p><p className="mt-1 text-xs text-[var(--app-muted)]">{usable ? "현재 사진으로 확인 가능" : "조명 영향이 있어 자연광 사진 권장"}</p></div>)}</div>{colorQuality.blockers.length ? <div className="mt-4" role="alert"><p className="text-sm font-black text-[var(--app-danger)]">다시 촬영이 필요한 항목</p><ul className="mt-2 grid gap-2 text-sm">{colorQuality.blockers.map((item) => <li key={item.code}>{item.message}</li>)}</ul></div> : null}{colorQuality.warnings.length ? <div className="mt-4"><p className="text-sm font-black">확인할 점</p><ul className="mt-2 grid gap-2 text-sm text-[var(--app-muted)]">{colorQuality.warnings.map((item) => <li key={item.code}>{item.message}</li>)}</ul></div> : null}</SurfaceCard> : null}
    <SurfaceCard className="p-5"><p className="app-kicker">사진 사용 가능 여부</p><h2 className="mt-3 text-xl font-black">분석 전에 사진 상태를 확인했어요</h2><div className="mt-5 grid gap-2 sm:grid-cols-2">{photo.quality.map((item) => <div key={item.id} className={`grid min-h-20 gap-1 border p-3 text-left ${item.status === "pass" ? "border-[var(--app-success)] bg-[var(--app-success-bg)]" : item.status === "warning" ? "border-[var(--app-warning)] bg-[var(--app-warning-bg)]" : "border-[var(--app-border)] bg-[var(--app-surface)]"}`}><span className="text-sm font-black">{item.label}</span><span className="text-xs text-[var(--app-muted)]">{item.message}</span></div>)}</div><details className="mt-5 border-t border-[var(--app-border)] pt-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-black">사진 처리 상세 보기</summary><DefinitionRows items={[
      { label: "선택한 사진", value: file?.name || (photo.draftId ? "임시 사진 준비됨" : "선택 전") },
      { label: "해상도", value: details.width && details.height ? `${details.width}×${details.height}px` : "검사 대기" },
      { label: "분석 영역", value: crop ? `4:5 · ${crop.outputWidth}×${crop.outputHeight}px` : "프레이밍 대기" },
      { label: "컬러 촬영 모드", value: captureMode === "precision" ? "정밀 · 사진 2장" : "빠른 · 사진 1장" },
      { label: "자연광 보조 사진", value: photo.colorAssistCaptureAssetId ? "안전하게 연결됨" : assistFile ? "검사 완료 · 업로드 준비됨" : captureMode === "precision" ? "필수 사진 대기" : "사용하지 않음" },
      { label: "얼굴 감지", value: faceEvidence ? "완료" : "대기" },
      { label: "분석 연결", value: photo.draftId ? "완료" : "업로드 대기" },
    ]} /></details></SurfaceCard>
    <SurfaceCard className="p-5"><p className="app-kicker">사진 보호</p><h2 className="mt-3 text-xl font-black">사진은 분석에 필요한 기간만 비공개로 보관합니다</h2><p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">원본 경로는 고객 화면이나 공유 자료에 노출하지 않으며, 선택한 보존 기간이 지나면 삭제합니다.</p></SurfaceCard>
    <ConsultationSystemData snapshot={snapshot} items={[{ label: "사진 검사 상태", value: status }]} />
  </>} />;
}
