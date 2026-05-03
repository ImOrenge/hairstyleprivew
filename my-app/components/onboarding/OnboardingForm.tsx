"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/Button";
import { Panel, SurfaceCard } from "../ui/Surface";
import {
  type AccountType,
  type OnboardingAccountType,
  type MemberStyleTarget,
  type MemberStyleTone,
} from "../../lib/onboarding";

interface OnboardingFormProps {
  returnUrl: string;
  forcedAccountType?: OnboardingAccountType;
}

interface OnboardingResponse {
  onboardingComplete: boolean;
  accountType: AccountType | null;
  memberProfile?: {
    displayName?: string;
    styleTarget?: MemberStyleTarget;
    preferredStyleTone?: MemberStyleTone;
  } | null;
  salonProfile?: {
    managerName?: string;
    shopName?: string;
    contactPhone?: string;
    region?: string;
    instagramHandle?: string;
    introduction?: string;
    businessRegistrationNumber?: string;
    businessStartedOn?: string;
    businessRepresentativeName?: string;
    businessStatusCode?: string;
    businessStatusLabel?: string;
    businessVerifiedAt?: string;
  } | null;
  redirectTo?: string;
  error?: string;
}

const memberToneOptions: Array<{ value: MemberStyleTone; label: string; description: string }> = [
  { value: "natural", label: "내추럴", description: "부담 없고 자연스러운 스타일 선호" },
  { value: "trendy", label: "트렌디", description: "최근 유행과 변화감 있는 스타일 선호" },
  { value: "soft", label: "소프트", description: "부드럽고 편안한 인상 중심" },
  { value: "bold", label: "볼드", description: "또렷하고 존재감 있는 스타일 선호" },
];

const memberTargetOptions: Array<{ value: MemberStyleTarget; label: string }> = [
  { value: "male", label: "남성형" },
  { value: "female", label: "여성형" },
  { value: "neutral", label: "중립" },
];

export function OnboardingForm({ returnUrl, forcedAccountType }: OnboardingFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRole, setSelectedRole] = useState<OnboardingAccountType | null>(forcedAccountType ?? null);
  const [error, setError] = useState<string | null>(null);

  const [memberForm, setMemberForm] = useState({
    displayName: "",
    styleTarget: "neutral" as MemberStyleTarget,
    preferredStyleTone: "natural" as MemberStyleTone,
  });

  const [salonForm, setSalonForm] = useState({
    managerName: "",
    shopName: "",
    contactPhone: "",
    region: "",
    instagramHandle: "",
    introduction: "",
    businessRegistrationNumber: "",
    businessStartedOn: "",
    businessRepresentativeName: "",
  });

  useEffect(() => {
    let active = true;

    async function loadOnboarding() {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/onboarding", { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as OnboardingResponse | null;

      if (!active) {
        return;
      }

      if (response.ok && data) {
        if (data.onboardingComplete) {
          router.replace(data.redirectTo || returnUrl);
          return;
        }

        if (forcedAccountType) {
          setSelectedRole(forcedAccountType);
        } else if (data.accountType === "member" || data.accountType === "salon_owner") {
          setSelectedRole(data.accountType);
        }

        if (data.memberProfile) {
          setMemberForm({
            displayName: data.memberProfile.displayName || "",
            styleTarget: data.memberProfile.styleTarget || "neutral",
            preferredStyleTone: data.memberProfile.preferredStyleTone || "natural",
          });
        }

        if (data.salonProfile) {
          setSalonForm({
            managerName: data.salonProfile.managerName || "",
            shopName: data.salonProfile.shopName || "",
            contactPhone: data.salonProfile.contactPhone || "",
            region: data.salonProfile.region || "",
            instagramHandle: data.salonProfile.instagramHandle || "",
            introduction: data.salonProfile.introduction || "",
            businessRegistrationNumber: data.salonProfile.businessRegistrationNumber || "",
            businessStartedOn: data.salonProfile.businessStartedOn || "",
            businessRepresentativeName: data.salonProfile.businessRepresentativeName || "",
          });
        }
      } else {
        setError(data?.error || "온보딩 정보를 불러오지 못했습니다.");
      }

      setIsLoading(false);
    }

    void loadOnboarding();

    return () => {
      active = false;
    };
  }, [forcedAccountType, returnUrl, router]);

  const canSubmit = useMemo(() => {
    if (selectedRole === "member") {
      return Boolean(memberForm.displayName.trim());
    }

    if (selectedRole === "salon_owner") {
      return Boolean(
        salonForm.managerName.trim() &&
          salonForm.shopName.trim() &&
          salonForm.contactPhone.trim() &&
          salonForm.region.trim() &&
          salonForm.businessRegistrationNumber.trim() &&
          salonForm.businessStartedOn.trim() &&
          salonForm.businessRepresentativeName.trim(),
      );
    }

    return false;
  }, [memberForm, salonForm, selectedRole]);

  const handleSubmit = async () => {
    if (!selectedRole || !canSubmit || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const payload =
      selectedRole === "member"
        ? {
            accountType: "member" as const,
            displayName: memberForm.displayName,
            styleTarget: memberForm.styleTarget,
            preferredStyleTone: memberForm.preferredStyleTone,
            returnUrl,
          }
        : {
            accountType: "salon_owner" as const,
            managerName: salonForm.managerName,
            shopName: salonForm.shopName,
            contactPhone: salonForm.contactPhone,
            region: salonForm.region,
            instagramHandle: salonForm.instagramHandle,
            introduction: salonForm.introduction,
            businessRegistrationNumber: salonForm.businessRegistrationNumber,
            businessStartedOn: salonForm.businessStartedOn,
            businessRepresentativeName: salonForm.businessRepresentativeName,
            returnUrl,
          };

    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json().catch(() => null)) as OnboardingResponse | null;

    if (response.ok && data?.onboardingComplete) {
      router.replace(data.redirectTo || returnUrl);
      return;
    }

    setError(data?.error || "온보딩 저장에 실패했습니다.");
    setIsSubmitting(false);
  };

  if (isLoading) {
    return (
      <Panel className="px-6 py-10 text-center text-sm text-[var(--app-muted)]">
        가입 정보를 준비하고 있습니다...
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <Panel as="section" className="p-6">
        <div className="space-y-2">
          <p className="app-kicker">Step 1</p>
          <h2 className="text-2xl font-black tracking-tight text-[var(--app-text)]">
            {forcedAccountType ? "가입 유형이 설정되었습니다" : "가입 유형을 선택해 주세요"}
          </h2>
          <p className="text-sm leading-6 text-[var(--app-muted)]">
            {forcedAccountType
              ? "선택한 가입 경로에 맞춰 필요한 정보만 입력합니다."
              : "선택한 역할에 따라 첫 설정 폼이 달라집니다. 완료 전에는 핵심 기능을 사용할 수 없습니다."}
          </p>
        </div>

        {forcedAccountType ? (
          <SurfaceCard className="mt-6 px-4 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-subtle)]">
              {forcedAccountType === "member" ? "일반 유저" : "B2B 운영자"}
            </p>
            <p className="mt-2 text-lg font-black text-[var(--app-text)]">
              {forcedAccountType === "member" ? "개인 이용자 가입" : "살롱 운영자 가입"}
            </p>
            <p className="mt-1 text-sm leading-6 text-[var(--app-muted)]">
              {forcedAccountType === "member"
                ? "개인 이용자 프로필을 저장하면 바로 스타일 추천 흐름을 사용할 수 있습니다."
                : "사업자 인증을 통과해야 운영자 계정이 활성화되고 Salon CRM에 접근할 수 있습니다."}
            </p>
          </SurfaceCard>
        ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setSelectedRole("member")}
            className={`rounded-[1.75rem] border px-5 py-5 text-left transition ${
              selectedRole === "member"
                ? "border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)]"
                : "app-card hover:border-[var(--app-border-strong)]"
            }`}
          >
            <p className={`text-xs font-bold uppercase tracking-[0.16em] ${selectedRole === "member" ? "text-white/70" : "text-[var(--app-subtle)]"}`}>
              일반 유저
            </p>
            <p className="mt-3 text-xl font-black">헤어 스타일 추천을 받는 사용자</p>
            <p className={`mt-2 text-sm leading-6 ${selectedRole === "member" ? "text-white/80" : "text-[var(--app-muted)]"}`}>
              닉네임과 스타일 선호만 먼저 설정하고 바로 업로드와 생성 흐름으로 이어집니다.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setSelectedRole("salon_owner")}
            className={`rounded-[1.75rem] border px-5 py-5 text-left transition ${
              selectedRole === "salon_owner"
                ? "border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)]"
                : "app-card hover:border-[var(--app-border-strong)]"
            }`}
          >
            <p className={`text-xs font-bold uppercase tracking-[0.16em] ${selectedRole === "salon_owner" ? "text-white/70" : "text-[var(--app-subtle)]"}`}>
              헤어샵 운영자
            </p>
            <p className="mt-3 text-xl font-black">샵 정보를 등록하는 운영 계정</p>
            <p className={`mt-2 text-sm leading-6 ${selectedRole === "salon_owner" ? "text-white/80" : "text-[var(--app-muted)]"}`}>
              담당자와 샵 기본 정보를 등록해 이후 운영자 흐름에 사용할 수 있는 계정으로 분류합니다.
            </p>
          </button>
        </div>
        )}
      </Panel>

      {selectedRole ? (
        <Panel as="section" className="p-6">
          <div className="space-y-2">
            <p className="app-kicker">Step 2</p>
            <h2 className="text-2xl font-black tracking-tight text-[var(--app-text)]">
              {selectedRole === "member" ? "일반 유저 프로필 설정" : "헤어샵 운영자 정보 등록"}
            </h2>
            <p className="text-sm leading-6 text-[var(--app-muted)]">
              {selectedRole === "member"
                ? "서비스 추천 방향을 맞추기 위한 기본 선호 정보를 입력해 주세요."
                : "운영자 계정 구분을 위한 기본 사업 정보를 입력해 주세요."}
            </p>
          </div>

          {selectedRole === "member" ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-[var(--app-text)] sm:col-span-2">
                닉네임
                <input
                  value={memberForm.displayName}
                  onChange={(event) =>
                    setMemberForm((current) => ({ ...current, displayName: event.target.value }))
                  }
                  placeholder="서비스에서 사용할 이름"
                  className="app-input px-3 py-2 text-sm"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-[var(--app-text)]">
                타겟 스타일
                <select
                  value={memberForm.styleTarget}
                  onChange={(event) =>
                    setMemberForm((current) => ({
                      ...current,
                      styleTarget: event.target.value as MemberStyleTarget,
                    }))
                  }
                  className="app-input px-3 py-2 text-sm"
                >
                  {memberTargetOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-medium text-[var(--app-text)]">
                선호 스타일 톤
                <select
                  value={memberForm.preferredStyleTone}
                  onChange={(event) =>
                    setMemberForm((current) => ({
                      ...current,
                      preferredStyleTone: event.target.value as MemberStyleTone,
                    }))
                  }
                  className="app-input px-3 py-2 text-sm"
                >
                  {memberToneOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <SurfaceCard className="px-4 py-4 sm:col-span-2">
                <p className="app-kicker">선호 톤 안내</p>
                <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
                  {
                    memberToneOptions.find((option) => option.value === memberForm.preferredStyleTone)
                      ?.description
                  }
                </p>
              </SurfaceCard>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-[var(--app-text)]">
                담당자명
                <input
                  value={salonForm.managerName}
                  onChange={(event) =>
                    setSalonForm((current) => ({ ...current, managerName: event.target.value }))
                  }
                  placeholder="대표자 또는 담당자"
                  className="app-input px-3 py-2 text-sm"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-[var(--app-text)]">
                샵명
                <input
                  value={salonForm.shopName}
                  onChange={(event) =>
                    setSalonForm((current) => ({ ...current, shopName: event.target.value }))
                  }
                  placeholder="샵 또는 브랜드명"
                  className="app-input px-3 py-2 text-sm"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-[var(--app-text)]">
                연락처
                <input
                  value={salonForm.contactPhone}
                  onChange={(event) =>
                    setSalonForm((current) => ({ ...current, contactPhone: event.target.value }))
                  }
                  placeholder="010-1234-5678"
                  className="app-input px-3 py-2 text-sm"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-[var(--app-text)]">
                지역
                <input
                  value={salonForm.region}
                  onChange={(event) =>
                    setSalonForm((current) => ({ ...current, region: event.target.value }))
                  }
                  placeholder="서울 성수 / 부산 해운대"
                  className="app-input px-3 py-2 text-sm"
                />
              </label>

              <SurfaceCard className="px-4 py-4 sm:col-span-2">
                <p className="app-kicker">Business Verification</p>
                <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
                  사업자등록번호, 개업일자, 대표자명이 국세청 등록정보와 일치하고 계속사업자로 확인되어야 가입이 완료됩니다.
                </p>
              </SurfaceCard>

              <label className="grid gap-2 text-sm font-medium text-[var(--app-text)]">
                사업자등록번호
                <input
                  value={salonForm.businessRegistrationNumber}
                  onChange={(event) =>
                    setSalonForm((current) => ({ ...current, businessRegistrationNumber: event.target.value }))
                  }
                  placeholder="123-45-67890"
                  inputMode="numeric"
                  maxLength={12}
                  className="app-input px-3 py-2 text-sm"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-[var(--app-text)]">
                개업일자
                <input
                  value={salonForm.businessStartedOn}
                  onChange={(event) =>
                    setSalonForm((current) => ({ ...current, businessStartedOn: event.target.value }))
                  }
                  type="date"
                  className="app-input px-3 py-2 text-sm"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-[var(--app-text)] sm:col-span-2">
                대표자명
                <input
                  value={salonForm.businessRepresentativeName}
                  onChange={(event) =>
                    setSalonForm((current) => ({ ...current, businessRepresentativeName: event.target.value }))
                  }
                  placeholder="사업자등록증의 대표자명"
                  className="app-input px-3 py-2 text-sm"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-[var(--app-text)]">
                인스타그램
                <input
                  value={salonForm.instagramHandle}
                  onChange={(event) =>
                    setSalonForm((current) => ({ ...current, instagramHandle: event.target.value }))
                  }
                  placeholder="@shop_handle"
                  className="app-input px-3 py-2 text-sm"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-[var(--app-text)] sm:col-span-2">
                샵 소개
                <textarea
                  value={salonForm.introduction}
                  onChange={(event) =>
                    setSalonForm((current) => ({ ...current, introduction: event.target.value }))
                  }
                  rows={4}
                  placeholder="샵의 스타일 방향이나 핵심 서비스를 간단히 소개해 주세요."
                  className="app-input px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}

          {error ? (
            <p className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--app-muted)]">
              저장이 완료되면 바로 {returnUrl === "/home" ? "홈" : returnUrl === "/mypage" ? "마이페이지" : "이전 작업 흐름"}로 이동합니다.
            </p>
            <Button type="button" onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
              {isSubmitting ? "저장 중..." : "가입 정보 저장"}
            </Button>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
