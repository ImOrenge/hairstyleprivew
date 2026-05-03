"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";
import type { PersonalColorResult, StyleProfile } from "../../lib/fashion-types";
import { useAdminReadOnly } from "../../hooks/useAdminReadOnly";

interface StyleProfileResponse {
  profile?: StyleProfile;
  error?: string;
}

interface StyleProfileFormProps {
  variant?: "standalone" | "dashboard";
}

const initialProfile: StyleProfile = {
  userId: "",
  heightCm: null,
  bodyShape: "straight",
  topSize: "",
  bottomSize: "",
  fitPreference: "regular",
  colorPreference: "",
  exposurePreference: "balanced",
  avoidItems: [],
  personalColor: null,
  bodyPhotoPath: null,
  bodyPhotoUrl: null,
  bodyPhotoConsentAt: null,
  updatedAt: null,
};

const bodyShapeOptions = [
  ["straight", "스트레이트"],
  ["hourglass", "아워글래스"],
  ["triangle", "트라이앵글"],
  ["inverted_triangle", "역삼각형"],
  ["round", "라운드"],
] as const;

const fitOptions = [
  ["regular", "레귤러"],
  ["slim", "슬림"],
  ["relaxed", "릴랙스"],
  ["oversized", "오버핏"],
] as const;

const exposureOptions = [
  ["low", "낮음"],
  ["balanced", "균형"],
  ["bold", "과감"],
] as const;

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

function ColorSwatches({ colors }: { colors: PersonalColorResult["bestColors"] }) {
  if (!colors.length) {
    return <p className="text-xs text-stone-500">저장된 색상이 없습니다.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((color) => (
        <span
          key={`${color.nameEn}-${color.hex}`}
          className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700"
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

export function StyleProfileForm({
  variant = "standalone",
}: StyleProfileFormProps) {
  const { isAdminReadOnly } = useAdminReadOnly();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<StyleProfile>(initialProfile);
  const [avoidText, setAvoidText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setIsLoading(true);
      const response = await fetch("/api/style-profile", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as StyleProfileResponse;
      if (!active) return;

      if (response.ok && data.profile) {
        setProfile({ ...initialProfile, ...data.profile });
        setAvoidText((data.profile.avoidItems || []).join(", "));
        setError(null);
      } else {
        setError(data.error || "바디 프로필을 불러오지 못했습니다.");
      }
      setIsLoading(false);
    }

    void loadProfile();
    return () => {
      active = false;
    };
  }, []);

  const update = (patch: Partial<StyleProfile>) => {
    setProfile((current) => ({ ...current, ...patch }));
  };

  const handleSave = async () => {
    if (isAdminReadOnly) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    const response = await fetch("/api/style-profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        heightCm: profile.heightCm,
        bodyShape: profile.bodyShape,
        topSize: profile.topSize,
        bottomSize: profile.bottomSize,
        fitPreference: profile.fitPreference,
        colorPreference: profile.colorPreference,
        exposurePreference: profile.exposurePreference,
        avoidItems: avoidText,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as StyleProfileResponse;
    if (response.ok && data.profile) {
      setProfile({ ...initialProfile, ...data.profile });
      setAvoidText((data.profile.avoidItems || []).join(", "));
      setMessage("바디 프로필을 저장했습니다.");
    } else {
      setError(data.error || "바디 프로필 저장에 실패했습니다.");
    }
    setIsSaving(false);
  };

  const handleUpload = async (file: File | null | undefined) => {
    if (isAdminReadOnly) {
      return;
    }

    if (!file) return;

    setIsUploading(true);
    setError(null);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/style-profile/body-photo", {
      method: "POST",
      body: formData,
    });
    const data = (await response.json().catch(() => ({}))) as StyleProfileResponse;
    if (response.ok && data.profile) {
      setProfile({ ...initialProfile, ...data.profile });
      setAvoidText((data.profile.avoidItems || []).join(", "));
      setMessage("전신 참고 사진을 저장했습니다.");
    } else {
      setError(data.error || "전신 사진 업로드에 실패했습니다.");
    }
    setIsUploading(false);
  };

  const handleDeletePhoto = async () => {
    if (isAdminReadOnly) {
      return;
    }

    setIsUploading(true);
    setError(null);
    setMessage(null);

    const response = await fetch("/api/style-profile/body-photo", { method: "DELETE" });
    const data = (await response.json().catch(() => ({}))) as StyleProfileResponse;
    if (response.ok && data.profile) {
      setProfile({ ...initialProfile, ...data.profile });
      setMessage("전신 참고 사진을 삭제했습니다.");
    } else {
      setError(data.error || "전신 사진 삭제에 실패했습니다.");
    }
    setIsUploading(false);
  };

  const ready =
    Boolean(profile.heightCm) &&
    Boolean(profile.bodyShape) &&
    Boolean(profile.topSize) &&
    Boolean(profile.bottomSize) &&
    Boolean(profile.fitPreference) &&
    Boolean(profile.exposurePreference) &&
    Boolean(profile.bodyPhotoPath);

  const content = (
    <>
      {variant === "standalone" ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">바디 스타일 프로필</h3>
            <p className="mt-1 text-sm text-gray-600">
              저장된 체형 정보와 전신 참고 사진은 패션 룩북 추천에 사용됩니다.
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {ready ? "준비 완료" : "미완성"}
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-[1.5rem] border border-stone-200 bg-stone-50 px-4 py-4">
          <div>
            <p className="text-xs font-bold uppercase text-stone-400">프로필 상태</p>
            <p className="mt-2 text-base font-semibold text-stone-900">
              {ready ? "패션 추천을 시작할 준비가 완료되었습니다." : "전신 사진과 체형 정보를 먼저 채워 주세요."}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${ready ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            {ready ? "준비됨" : "설정 필요"}
          </span>
        </div>
      )}

      {isAdminReadOnly ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Admin read-only mode: use Admin screens for changes.
        </div>
      ) : null}

      {isLoading ? (
        <div className="mt-4 rounded-xl bg-stone-50 p-4 text-sm text-stone-500">바디 프로필을 불러오는 중입니다...</div>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
          <div className="space-y-3">
            <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-stone-200 bg-stone-100">
              {profile.bodyPhotoUrl ? (
                <img src={profile.bodyPhotoUrl} alt="전신 참고 사진" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-stone-500">
                  패션 룩북 생성을 위해 전신 참고 사진을 업로드하세요.
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              disabled={isAdminReadOnly}
              className="hidden"
              onChange={(event) => void handleUpload(event.target.files?.[0])}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isAdminReadOnly}
              >
                {isUploading ? "업로드 중..." : profile.bodyPhotoPath ? "사진 교체" : "사진 업로드"}
              </Button>
              {profile.bodyPhotoPath ? (
                <Button type="button" variant="ghost" onClick={handleDeletePhoto} disabled={isUploading || isAdminReadOnly}>
                  삭제
                </Button>
              ) : null}
            </div>
            <p className="text-xs leading-5 text-stone-500">
              전신 참고 사진은 비공개로 저장되며, 패션 룩북 생성 시 서명 URL을 통해서만 사용됩니다.
            </p>

            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase text-stone-400">Personal Color</p>
                  <p className="mt-1 text-sm font-semibold text-stone-900">
                    {profile.personalColor
                      ? `${formatTone(profile.personalColor.tone)} · ${formatContrast(profile.personalColor.contrast)}`
                      : "진단 결과 없음"}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${profile.personalColor ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}>
                  {profile.personalColor ? "저장됨" : "미진단"}
                </span>
              </div>

              {profile.personalColor ? (
                <div className="mt-3 space-y-3">
                  <p className="text-sm leading-6 text-stone-600">{profile.personalColor.summary}</p>
                  <div>
                    <p className="mb-2 text-xs font-bold text-stone-500">추천 색상</p>
                    <ColorSwatches colors={profile.personalColor.bestColors} />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-bold text-stone-500">피해야 할 색상</p>
                    <ColorSwatches colors={profile.personalColor.avoidColors} />
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-stone-600">
                  얼굴 정면 사진으로 톤과 대비를 분석해 패션 추천 팔레트에 반영합니다.
                </p>
              )}

              {isAdminReadOnly ? (
                <Button type="button" variant="secondary" className="mt-4" disabled>
                  {profile.personalColor ? "퍼스널컬러 재진단" : "퍼스널컬러 진단"}
                </Button>
              ) : (
                <Link
                  href="/personal-color?source=mypage&returnTo=%2Fmypage%3Ftab%3Dbody-profile"
                  className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-900 transition hover:border-stone-900 hover:bg-stone-50"
                >
                  {profile.personalColor ? "퍼스널컬러 재진단" : "퍼스널컬러 진단"}
                </Link>
              )}
            </div>
          </div>

          <fieldset disabled={isAdminReadOnly} className="grid gap-4 sm:grid-cols-2 disabled:opacity-75">
            <label className="grid gap-1 text-sm font-medium text-stone-700">
              키 (cm)
              <input
                type="number"
                min={120}
                max={230}
                value={profile.heightCm ?? ""}
                onChange={(event) => update({ heightCm: event.target.value ? Number(event.target.value) : null })}
                className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-900"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-700">
              체형
              <select
                value={profile.bodyShape ?? "straight"}
                onChange={(event) => update({ bodyShape: event.target.value as StyleProfile["bodyShape"] })}
                className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-900"
              >
                {bodyShapeOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-700">
              상의 사이즈
              <input
                value={profile.topSize ?? ""}
                onChange={(event) => update({ topSize: event.target.value })}
                placeholder="S, M, 95, 100..."
                className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-900"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-700">
              하의 사이즈
              <input
                value={profile.bottomSize ?? ""}
                onChange={(event) => update({ bottomSize: event.target.value })}
                placeholder="26, 28, M..."
                className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-900"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-700">
              선호 핏
              <select
                value={profile.fitPreference ?? "regular"}
                onChange={(event) => update({ fitPreference: event.target.value as StyleProfile["fitPreference"] })}
                className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-900"
              >
                {fitOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-700">
              노출 선호
              <select
                value={profile.exposurePreference ?? "balanced"}
                onChange={(event) => update({ exposurePreference: event.target.value as StyleProfile["exposurePreference"] })}
                className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-900"
              >
                {exposureOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-700 sm:col-span-2">
              선호 색상
              <input
                value={profile.colorPreference ?? ""}
                onChange={(event) => update({ colorPreference: event.target.value })}
                placeholder="블랙, 아이보리, 쿨 그레이..."
                className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-900"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-700 sm:col-span-2">
              피하고 싶은 아이템
              <input
                value={avoidText}
                onChange={(event) => setAvoidText(event.target.value)}
                placeholder="모자, 스키니진, 짧은 치마..."
                className="rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-900"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <Button type="button" onClick={handleSave} disabled={isSaving || isAdminReadOnly}>
                {isSaving ? "저장 중..." : "바디 프로필 저장"}
              </Button>
              {message ? <p className="text-sm font-medium text-emerald-700">{message}</p> : null}
              {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
            </div>
          </fieldset>
        </div>
      )}
    </>
  );

  if (variant === "dashboard") {
    return content;
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      {content}
    </section>
  );
}
