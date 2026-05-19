"use client";

import { useState } from "react";
import type { MemberStyleTarget, MemberStyleTone } from "../../lib/onboarding";
import { Button } from "../ui/Button";
import { SurfaceCard } from "../ui/Surface";

const genderOptions: Array<{ value: MemberStyleTarget; label: string }> = [
  { value: "male", label: "남성" },
  { value: "female", label: "여성" },
];

const toneOptions: Array<{ value: MemberStyleTone; label: string; description: string }> = [
  { value: "natural", label: "내추럴", description: "부담 없고 자연스러운 스타일 선호" },
  { value: "trendy", label: "트렌디", description: "최근 유행과 변화감 있는 스타일 선호" },
  { value: "soft", label: "소프트", description: "부드럽고 편안한 인상 중심" },
  { value: "bold", label: "볼드", description: "또렷하고 존재감 있는 스타일 선호" },
];

function formatGender(value: MemberStyleTarget | null) {
  if (value === "male") return "남성";
  if (value === "female") return "여성";
  return "미입력";
}

interface MemberGenderFormProps {
  initialDisplayName: string;
  initialPreferredStyleTone: MemberStyleTone;
  initialStyleTarget: MemberStyleTarget | null;
}

export function MemberGenderForm({
  initialDisplayName,
  initialPreferredStyleTone,
  initialStyleTarget,
}: MemberGenderFormProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [styleTarget, setStyleTarget] = useState<MemberStyleTarget | "">(initialStyleTarget ?? "");
  const [preferredStyleTone, setPreferredStyleTone] = useState<MemberStyleTone>(initialPreferredStyleTone);
  const [savedStyleTarget, setSavedStyleTarget] = useState<MemberStyleTarget | null>(initialStyleTarget);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSave = Boolean(displayName.trim() && styleTarget && preferredStyleTone);

  const handleSave = async () => {
    if (!canSave || isSaving) {
      return;
    }

    const selectedStyleTarget = styleTarget as MemberStyleTarget;
    setIsSaving(true);
    setMessage(null);
    setError(null);

    const response = await fetch("/api/member-profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        displayName,
        styleTarget: selectedStyleTarget,
        preferredStyleTone,
      }),
    });
    const data = (await response.json().catch(() => null)) as {
      profile?: {
        displayName?: string;
        styleTarget?: MemberStyleTarget | null;
        preferredStyleTone?: MemberStyleTone;
      };
      error?: string;
    } | null;

    if (!response.ok) {
      setError(data?.error || "계정 설정 저장에 실패했습니다.");
      setIsSaving(false);
      return;
    }

    const nextTarget = data?.profile?.styleTarget ?? selectedStyleTarget;
    const nextName = data?.profile?.displayName ?? displayName;
    const nextTone = data?.profile?.preferredStyleTone ?? preferredStyleTone;
    setSavedStyleTarget(nextTarget);
    setStyleTarget(nextTarget);
    setDisplayName(nextName);
    setPreferredStyleTone(nextTone);
    setMessage("계정 설정이 저장되었습니다.");
    setIsSaving(false);
  };

  return (
    <SurfaceCard className="mt-4 px-4 py-4">
      <div className="space-y-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--app-muted)]">Account Setup</p>
          <p className="mt-2 text-sm font-semibold text-[var(--app-text)]">
            현재 성별: {formatGender(savedStyleTarget)}
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--app-muted)]">
            닉네임, 성별, 선호 스타일 톤은 헤어 추천 생성 기준으로 사용됩니다.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-[var(--app-text)] sm:col-span-2">
            닉네임
            <input
              className="app-input px-3 py-2 text-sm"
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="서비스에서 사용할 이름"
              value={displayName}
            />
          </label>

          <label className="grid gap-2 text-sm font-medium text-[var(--app-text)]">
            성별
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
          </label>

          <label className="grid gap-2 text-sm font-medium text-[var(--app-text)]">
            선호 스타일 톤
            <select
              value={preferredStyleTone}
              onChange={(event) => setPreferredStyleTone(event.target.value as MemberStyleTone)}
              className="app-input px-3 py-2 text-sm"
            >
              {toneOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <SurfaceCard className="px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--app-muted)]">선호 톤 안내</p>
          <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
            {toneOptions.find((option) => option.value === preferredStyleTone)?.description}
          </p>
        </SurfaceCard>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={handleSave} disabled={!canSave || isSaving}>
            {isSaving ? "저장 중..." : "계정 설정 저장"}
          </Button>
          {message ? <p className="text-sm font-medium text-emerald-700">{message}</p> : null}
          {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
        </div>
      </div>
    </SurfaceCard>
  );
}
