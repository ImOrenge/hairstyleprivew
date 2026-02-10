"use client";

import Link from "next/link";
import { FaceGuideOverlay } from "../../components/upload/FaceGuideOverlay";
import { UploadArea } from "../../components/upload/UploadArea";
import { ValidationCheck } from "../../components/upload/ValidationCheck";
import { Button } from "../../components/ui/Button";
import { useUpload } from "../../hooks/useUpload";
import { useGenerationStore } from "../../store/useGenerationStore";

export default function UploadPage() {
  const { status, message, validateImage } = useUpload();
  const { previewUrl, setOriginalImage } = useGenerationStore((state) => ({
    previewUrl: state.previewUrl,
    setOriginalImage: state.setOriginalImage,
  }));

  const handleSelectFile = async (file: File) => {
    const result = await validateImage(file);
    if (!result.ok) {
      return;
    }

    setOriginalImage(file);
  };

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-4 px-6 py-8">
      <h1 className="text-2xl font-bold">사진 업로드</h1>
      <UploadArea onSelectFile={handleSelectFile} />
      <FaceGuideOverlay />
      <ValidationCheck status={status} message={message} />

      {previewUrl ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="mb-3 text-sm text-gray-600">업로드 미리보기</p>
          <img src={previewUrl} alt="업로드 미리보기" className="max-h-80 rounded-xl object-cover" />
        </section>
      ) : null}

      <div className="flex justify-end">
        {previewUrl ? (
          <Link href="/generate">
            <Button>다음 단계</Button>
          </Link>
        ) : (
          <Button disabled>다음 단계</Button>
        )}
      </div>
    </div>
  );
}
