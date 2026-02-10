"use client";

import { EditorLayout } from "../../components/editor/EditorLayout";
import { GenerateButton } from "../../components/editor/GenerateButton";
import { buildPrompt, PromptBuilder } from "../../components/editor/PromptBuilder";
import { StyleSelector } from "../../components/editor/StyleSelector";
import { useGenerationStore } from "../../store/useGenerationStore";

export default function GeneratePage() {
  const { previewUrl, selectedOptions } = useGenerationStore((state) => ({
    previewUrl: state.previewUrl,
    selectedOptions: state.selectedOptions,
  }));

  const prompt = buildPrompt(selectedOptions);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <h1 className="mb-4 text-2xl font-bold">스타일 선택 및 생성</h1>
      <EditorLayout
        preview={
          <div className="sticky top-6 space-y-3">
            <p className="text-sm font-semibold text-gray-600">원본 미리보기</p>
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="원본 업로드 이미지"
                className="max-h-[520px] w-full rounded-xl object-cover"
              />
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 p-8 text-sm text-gray-500">
                업로드된 이미지가 없습니다. `/upload`에서 사진을 먼저 등록해 주세요.
              </div>
            )}
          </div>
        }
        panel={
          <div className="space-y-6">
            <StyleSelector />
            <PromptBuilder options={selectedOptions} />
            <div className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
              <p className="font-semibold text-gray-700">프롬프트 미리보기</p>
              <p className="mt-1 break-all">{prompt}</p>
            </div>
            <GenerateButton prompt={prompt} disabled={!previewUrl} />
          </div>
        }
      />
    </div>
  );
}
