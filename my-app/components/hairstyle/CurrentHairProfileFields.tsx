"use client";

import type { CurrentHairProfile } from "../../lib/recommendation-types";
import { SurfaceCard } from "../ui/Surface";

/**
 * Component passport: feature/form candidate. Public API is value, source,
 * disabled, and onChange. State remains owned by the generation controller;
 * native labels/selects/checkboxes provide the accessibility contract.
 */
export function CurrentHairProfileFields({
  value,
  source,
  disabled = false,
  onChange,
}: {
  value: CurrentHairProfile;
  source: "user" | "salon";
  disabled?: boolean;
  onChange: (value: CurrentHairProfile) => void;
}) {
  const update = (patch: Partial<CurrentHairProfile>) => onChange({ ...value, ...patch, source });

  return (
    <SurfaceCard className="p-4">
      <p className="text-sm font-black text-[var(--app-text)]">현재 모발 프로필</p>
      <p className="mt-1 text-xs leading-5 text-[var(--app-muted)]">모르는 값은 그대로 두면 기존 추천 방식으로 진행합니다.</p>
      <fieldset disabled={disabled} className="mt-3 grid gap-3 disabled:opacity-70">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-xs font-bold text-[var(--app-muted)]">현재 길이
            <select className="min-h-11 border border-[var(--app-border)] bg-white px-3 text-sm text-[var(--app-text)]" value={value.currentLength} onChange={(event) => update({ currentLength: event.target.value as CurrentHairProfile["currentLength"] })}>
              <option value="unknown">모름</option><option value="short">단기장</option><option value="medium">중기장</option><option value="long">장기장</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold text-[var(--app-muted)]">모발 형태
            <select className="min-h-11 border border-[var(--app-border)] bg-white px-3 text-sm text-[var(--app-text)]" value={value.textureType} onChange={(event) => update({ textureType: event.target.value as CurrentHairProfile["textureType"] })}>
              <option value="unknown">모름</option><option value="straight">직모</option><option value="wavy_curly">곱슬</option><option value="tight_curly_frizzy">강한 곱슬</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold text-[var(--app-muted)]">모발 굵기
            <select className="min-h-11 border border-[var(--app-border)] bg-white px-3 text-sm text-[var(--app-text)]" value={value.strandThickness} onChange={(event) => update({ strandThickness: event.target.value as CurrentHairProfile["strandThickness"] })}>
              <option value="unknown">모름</option><option value="fine">가는 모발</option><option value="medium">보통</option><option value="coarse">굵은 모발</option>
            </select>
          </label>
        </div>
        <fieldset className="grid gap-2">
          <legend className="text-xs font-bold text-[var(--app-muted)]">시술·손상 상태(복수 선택)</legend>
          <div className="flex flex-wrap gap-3">
            {([['damaged', '손상'], ['bleached', '탈색'], ['colored', '염색'], ['permed', '펌']] as const).map(([condition, label]) => (
              <label key={condition} className="inline-flex items-center gap-2 text-sm text-[var(--app-text)]">
                <input
                  type="checkbox"
                  checked={value.conditionTags.includes(condition)}
                  onChange={() => update({
                    conditionTags: value.conditionTags.includes(condition)
                      ? value.conditionTags.filter((item) => item !== condition)
                      : [...value.conditionTags, condition],
                  })}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </fieldset>
    </SurfaceCard>
  );
}
