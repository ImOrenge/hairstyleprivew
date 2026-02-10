"use client";

import { ChangeEvent, DragEvent, useRef } from "react";
import { Button } from "../ui/Button";

interface UploadAreaProps {
  onSelectFile: (file: File) => void;
}

export function UploadArea({ onSelectFile }: UploadAreaProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }

    onSelectFile(files[0]);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    handleFiles(event.dataTransfer.files);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFiles(event.target.files);
  };

  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      className="rounded-2xl border-2 border-dashed border-gray-300 bg-white p-8 text-center"
    >
      <p className="text-lg font-semibold">사진 업로드</p>
      <p className="mt-2 text-sm text-gray-600">이미지를 드래그하거나 파일을 선택하세요.</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="hidden"
      />
      <Button className="mt-6" onClick={() => inputRef.current?.click()}>
        파일 선택
      </Button>
    </div>
  );
}
