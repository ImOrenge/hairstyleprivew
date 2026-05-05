"use client";

import { useState } from "react";
import type { MemberStyleTarget } from "../../lib/onboarding";
import { Button } from "../ui/Button";
import { SurfaceCard } from "../ui/Surface";

const genderOptions: Array<{ value: MemberStyleTarget; label: string }> = [
  { value: "male", label: "남성" },
  { value: "female", label: "여성" },
];

function formatGender(value: MemberStyleTarget | null) {
  if (value === "male") return "남성";
  if (value === "female") return "여성";
  return "미입력";
}

export function MemberGenderForm({ initialStyleTarget }: { initialStyleTarget: MemberStyleTarget | null }) {
  const [styleTarget, setStyleTarget] = useState<MemberStyleTarget | "">(initialStyleTarget ?? "");
  const [savedStyleTarget, setSavedStyleTarget] = useState<MemberStyleTarget | null>(initialStyleTarget);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!styleTarget || isSaving) {
      return;
    }

    setIsSaving(true);
    setMessage(null);
    setError(null);

    const response = await fetch("/api/member-profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ styleTarget }),
    });
    const data = (await response.json().catch(() => null)) as {
      profile?: { styleTarget?: MemberStyleTarget | null };
      error?: string;
    } | null;

    if (!response.ok) {
      setError(data?.error || "성별 저장에 실패했습니다.");
      setIsSaving(false);
      return;
    }

    const nextTarget = data?.profile?.styleTarget ?? styleTarget;
    setSavedStyleTarget(nextTarget);
    setStyleTarget(nextTarget);
    setMessage("성별 정보가 저장되었습니다.");
    setIsSaving(false);
  };

  return (
    <SurfaceCard className="mt-4 px-4 py-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--app-muted)]">성별</p>
          <p className="mt-2 text-sm font-semibold text-[var(--app-text)]">
            현재 성별: {formatGender(savedStyleTarget)}
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--app-muted)]">
            헤어스타일 생성 시 남성/여성 카탈로그와 프롬프트를 구분하는 기준입니다.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-60">
          <select
            value={styleTarget}
            onChange={(event) => setStyleTarget(event.target.value as MemberStyleTarget | "")}
            className="app-input px-3 py-2 text-sm"
          >
            <option value="">성별을 선택해 주세요</option>
            {genderOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button type="button" onClick={handleSave} disabled={!styleTarget || isSaving}>
            {isSaving ? "저장 중..." : "성별 저장"}
          </Button>
        </div>
      </div>

      {message ? <p className="mt-3 text-sm font-medium text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
    </SurfaceCard>
  );
}
