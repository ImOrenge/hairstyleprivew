"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPendingPhotoDiagnostics } from "@hairfit/shared";
import type { PhotoFaceDetectionEvidence } from "@hairfit/shared";
import type {
  AnalysisEvidenceDraft,
  ConsultationPatch,
  ConsultationSnapshot,
  FaceAnalysis,
  PhotoQualityDiagnostic,
  PhotoSnapshot,
} from "../../../lib/consulting/contracts";
import { convertImageFileToWebp } from "../../../lib/webp-client";
import { useUpload } from "../../../hooks/useUpload";
import { Button } from "../../ui/Button";
import { Panel, SaveStageButton, SurfaceCard, WorkbenchGrid } from "./shared";

type DraftReceipt = {
  draftId: string;
  clientRequestId: string;
  state: "ready";
  uploadedAt: string;
  expiresAt: string;
};

type AnalysisResponse = {
  requiresRetry?: boolean;
  evidence?: AnalysisEvidenceDraft;
  faceAnalysis?: FaceAnalysis;
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

export function PhotoWorkbench({ snapshot, mutate, saving }: {
  snapshot: ConsultationSnapshot;
  mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>;
  saving: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<PhotoSnapshot>(snapshot.photo);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [faceEvidence, setFaceEvidence] = useState<PhotoFaceDetectionEvidence | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { status, message, details, validateImage, resetValidation } = useUpload();

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const selectFile = async (selected: File) => {
    setWorking(true);
    setError(null);
    setFile(null);
    setFaceEvidence(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPhoto((current) => ({
      ...current,
      generationId: null,
      draftId: null,
      clientRequestId: null,
      uploadedAt: null,
      expiresAt: null,
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
      if (!validation.ok) return;
      const converted = await convertImageFileToWebp(selected);
      setFile(converted);
      setPreviewUrl(URL.createObjectURL(converted));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "사진을 준비하지 못했습니다.");
    } finally {
      setWorking(false);
    }
  };

  const uploadDraft = async () => {
    if (!file) {
      if (photo.draftId) return {
        draftId: photo.draftId,
        clientRequestId: photo.clientRequestId ?? photo.draftId,
        state: "ready" as const,
        uploadedAt: photo.uploadedAt ?? new Date().toISOString(),
        expiresAt: photo.expiresAt ?? new Date(Date.now() + 60_000).toISOString(),
      };
      throw new Error("분석할 정면 사진을 먼저 선택해 주세요.");
    }
    const clientRequestId = crypto.randomUUID();
    const response = await fetch("/api/generations/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientRequestId, referenceImageDataUrl: await fileToDataUrl(file) }),
    });
    const data = (await response.json().catch(() => ({}))) as Partial<DraftReceipt> & { error?: string };
    if (!response.ok || !data.draftId || !data.uploadedAt || !data.expiresAt) {
      throw new Error(data.error || "사진을 안전하게 업로드하지 못했습니다.");
    }
    return data as DraftReceipt;
  };

  const analyze = async () => {
    if (!photo.usageScopes.includes("analysis") || !photo.usageScopes.includes("preview")) {
      setError("얼굴 분석과 헤어 프리뷰 사용 범위를 모두 선택해 주세요.");
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const receipt = await uploadDraft();
      const uploadedPhoto: PhotoSnapshot = {
        ...photo,
        generationId: null,
        draftId: receipt.draftId,
        clientRequestId: receipt.clientRequestId,
        uploadedAt: receipt.uploadedAt,
        expiresAt: receipt.expiresAt,
      };
      setPhoto(uploadedPhoto);
      setFile(null);
      const response = await fetch(`/api/consultations/${encodeURIComponent(snapshot.sessionId)}/photo-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: receipt.draftId, expectedVersion: snapshot.version, faceEvidence }),
      });
      const data = (await response.json().catch(() => ({}))) as AnalysisResponse;
      if (data.quality) setPhoto((current) => ({ ...current, quality: data.quality ?? current.quality }));
      if (data.requiresRetry) {
        setError(data.preflightMessage || "사진 사전검사를 통과하지 못했습니다. 다른 사진을 선택해 주세요.");
        return;
      }
      if (!response.ok || !data.evidence || !data.faceAnalysis || !data.quality || !data.analyzedAt) {
        throw new Error(data.error || "사진 분석을 완료하지 못했습니다.");
      }
      const nextPhoto: PhotoSnapshot = {
        ...uploadedPhoto,
        capturedAt: data.analyzedAt,
        quality: data.quality,
      };
      setPhoto(nextPhoto);
      const result = await mutate({
        photo: nextPhoto,
        evidence: data.evidence,
        faceAnalysis: data.faceAnalysis,
        completeStage: "photo",
        currentStage: "scan",
      }) as { ok?: boolean };
      if (result.ok) router.push(`/consulting/${snapshot.sessionId}/scan`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "사진 분석을 완료하지 못했습니다.");
    } finally {
      setWorking(false);
    }
  };

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFile(null);
    setFaceEvidence(null);
    setPhoto({
      ...snapshot.photo,
      draftId: null,
      clientRequestId: null,
      uploadedAt: null,
      expiresAt: null,
      quality: createPendingPhotoDiagnostics(),
    });
    resetValidation();
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return <WorkbenchGrid>
    <Panel className="grid gap-6 p-5 sm:p-7">
      <div>
        <p className="text-sm font-black">상담용 정면 사진</p>
        <p className="mt-1 text-sm text-[var(--app-muted)]">시스템 사진 사전검사를 통과한 뒤 private Storage 업로드와 AI 상담 분석을 진행합니다. 구 마법사로 이동하지 않습니다.</p>
      </div>
      <label className="grid cursor-pointer gap-3 border border-dashed border-[var(--app-border-strong)] bg-[var(--app-surface)] p-5 text-center">
        <span className="text-sm font-black">정면 사진 선택</span>
        <span className="text-xs text-[var(--app-muted)]">JPG·PNG·WebP, 얼굴과 헤어라인이 모두 보이는 사진</span>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={working || saving} onChange={(event) => { const selected = event.target.files?.[0]; if (selected) void selectFile(selected); }} />
      </label>
      {previewUrl ? <div className="overflow-hidden border border-[var(--app-border)]"><img src={previewUrl} alt="선택한 상담 사진 미리보기" className="max-h-[32rem] w-full object-contain" /></div> : null}
      <p className={`text-sm ${status === "error" ? "text-[var(--app-danger)]" : "text-[var(--app-muted)]"}`}>{message}</p>
      {details.width && details.height ? <p className="text-xs text-[var(--app-muted)]">{details.width}×{details.height}px · {details.sizeMB}MB</p> : null}
      <div className="grid gap-2 sm:grid-cols-2">{photo.quality.map((item) => <div key={item.id} className={`grid min-h-20 gap-1 border p-3 text-left ${item.status === "pass" ? "border-[var(--app-success)] bg-[var(--app-success-bg)]" : item.status === "warning" ? "border-[var(--app-warning)] bg-[var(--app-warning-bg)]" : "border-[var(--app-border)] bg-[var(--app-surface)]"}`}><span className="text-sm font-black">{item.label}</span><span className="text-xs text-[var(--app-muted)]">{item.message}</span></div>)}</div>
      <fieldset><legend className="text-sm font-black">사진 사용 범위</legend><div className="mt-2 flex flex-wrap gap-2">{[["analysis","얼굴 분석"],["preview","헤어 프리뷰"],["personalColor","컬러 진단"]].map(([scope,label]) => <button type="button" key={scope} onClick={() => setPhoto({ ...photo, usageScopes: photo.usageScopes.includes(scope) ? photo.usageScopes.filter((item) => item !== scope) : [...photo.usageScopes, scope] })} aria-pressed={photo.usageScopes.includes(scope)} className={`min-h-11 border px-4 text-sm font-black ${photo.usageScopes.includes(scope) ? "bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "bg-[var(--app-surface)]"}`}>{label}</button>)}</div></fieldset>
      <fieldset><legend className="text-sm font-black">사진 보존 기간</legend><div className="mt-2 flex gap-2">{([1,7,30] as const).map((days) => <button type="button" key={days} onClick={() => setPhoto({ ...photo, retentionDays: days })} aria-pressed={photo.retentionDays === days} className={`min-h-11 border px-4 text-sm font-black ${photo.retentionDays === days ? "bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "bg-[var(--app-surface)]"}`}>{days}일</button>)}</div></fieldset>
      {error ? <p className="border border-[var(--app-danger)] bg-[var(--app-danger-bg)] p-3 text-sm">{error}</p> : null}
      <div className="flex flex-wrap gap-2"><SaveStageButton loading={working || saving} disabled={!file && !photo.draftId} onClick={() => void analyze()}>사진 업로드 및 AI 상담 분석</SaveStageButton><Button type="button" variant="ghost" disabled={working || saving} onClick={reset}>다시 선택</Button></div>
    </Panel>
    <SurfaceCard className="p-5"><p className="app-kicker">Private photo workflow</p><h2 className="mt-3 text-xl font-black">업로드와 분석은 생성보다 먼저 끝납니다</h2><p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">사진은 private Storage에 임시 보관되고 원본 경로는 화면에 노출되지 않습니다. 분석 근거와 전략을 확인한 뒤에만 3×3 생성을 접수합니다.</p></SurfaceCard>
  </WorkbenchGrid>;
}
