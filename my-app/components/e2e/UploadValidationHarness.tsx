"use client";

import { useCallback, useState } from "react";
import { useUpload } from "../../hooks/useUpload";
import { UploadArea } from "../upload/UploadArea";
import { ValidationCheck } from "../upload/ValidationCheck";
import { Panel, SurfaceCard } from "../ui/Surface";

export function UploadValidationHarness() {
  const { status, message, details, validateImage } = useUpload();
  const [selectedFileName, setSelectedFileName] = useState("선택 전");

  const handleFile = useCallback(async (file: File) => {
    setSelectedFileName(file.name);
    await validateImage(file);
  }, [validateImage]);

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10">
      <Panel as="section" className="p-6">
        <p className="app-kicker">E2E 전용</p>
        <h1 className="mt-2 text-3xl font-black text-[var(--app-text)]">운영 업로드 검증</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
          운영 UploadArea와 공용 이미지 검증 계약의 오류 안내 및 접근성 상태를 검증합니다.
        </p>
      </Panel>

      <SurfaceCard as="section" className="grid gap-4 p-5">
        <UploadArea
          onSelectFile={(file) => void handleFile(file)}
          onRejectFile={(file) => void handleFile(file)}
        />
        <p className="text-sm text-[var(--app-muted)]">검증 파일: {selectedFileName}</p>
        <ValidationCheck status={status} message={message} details={details} />
      </SurfaceCard>
    </main>
  );
}
