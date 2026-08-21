"use client";

import { useState } from "react";
import type { MakeupModuleDirection } from "@hairfit/shared/makeup";
import { Button } from "../../ui/Button";

type Patch = Record<string, unknown>;

const FINISHES = ["matte", "semi_matte", "natural", "semi_glow", "glow", "satin", "soft_matte", "gloss", "defined"];

export function MakeupAdjustmentControls({ active, disabled, onPatch }: { active: MakeupModuleDirection; disabled: boolean; onPatch: (patch: Patch) => Promise<void> | void }) {
  const [intensity, setIntensity] = useState(active.direction.intensity);
  const [colorFamily, setColorFamily] = useState(active.direction.colorFamily ?? "");
  const commitIntensity = () => {
    if (intensity !== active.direction.intensity) void onPatch({ direction: { intensity } });
  };
  const nudgeAnchor = (dx: number, dy: number) => {
    const anchor = active.geometry.anchors[0]; if (!anchor) return;
    void onPatch({ geometry: { anchors: [{ index: 0, point: { x: Math.min(1, Math.max(0, anchor.x + dx)), y: Math.min(1, Math.max(0, anchor.y + dy)) } }] } });
  };
  const nudgeVector = (dx: number, dy: number) => {
    const vector = active.geometry.vectors[0]; if (!vector) return;
    void onPatch({ geometry: { vectors: [{ index: 0, dx: vector.dx + dx, dy: vector.dy + dy }] } });
  };
  return <div className="grid gap-5">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-bold">강도 {Math.round(intensity * 100)}%
        <input type="range" min="0" max="1" step="0.01" disabled={disabled} value={intensity} onChange={(event) => setIntensity(Number(event.target.value))} onPointerUp={commitIntensity} onBlur={commitIntensity} />
      </label>
      <label className="grid gap-2 text-sm font-bold">색상 패밀리
        <input className="app-input min-h-11 px-3" disabled={disabled} value={colorFamily} onChange={(event) => setColorFamily(event.target.value)} onBlur={() => { if (colorFamily !== (active.direction.colorFamily ?? "")) void onPatch({ direction: { colorFamily: colorFamily || null } }); }} />
      </label>
      <label className="grid gap-2 text-sm font-bold">질감·피니시
        <select className="app-input min-h-11 px-3" disabled={disabled} value={active.direction.texture ?? "natural"} onChange={(event) => void onPatch({ direction: { texture: event.target.value } })}>
          {Array.from(new Set([active.direction.texture ?? "natural", ...FINISHES])).map((finish) => <option key={finish} value={finish}>{finish}</option>)}
        </select>
      </label>
    </div>
    <div>
      <p className="text-sm font-black">위치 조정</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={disabled || !active.geometry.anchors[0]} aria-label="첫 기준점을 왼쪽으로 이동" onClick={() => nudgeAnchor(-0.01, 0)}>기준점 ←</Button>
        <Button type="button" variant="secondary" disabled={disabled || !active.geometry.anchors[0]} aria-label="첫 기준점을 오른쪽으로 이동" onClick={() => nudgeAnchor(0.01, 0)}>기준점 →</Button>
        <Button type="button" variant="secondary" disabled={disabled || !active.geometry.anchors[0]} aria-label="첫 기준점을 위로 이동" onClick={() => nudgeAnchor(0, -0.01)}>기준점 ↑</Button>
        <Button type="button" variant="secondary" disabled={disabled || !active.geometry.anchors[0]} aria-label="첫 기준점을 아래로 이동" onClick={() => nudgeAnchor(0, 0.01)}>기준점 ↓</Button>
      </div>
    </div>
    <div>
      <p className="text-sm font-black">방향 조정</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={disabled || !active.geometry.vectors[0]} aria-label="방향 왼쪽으로 이동" onClick={() => nudgeVector(-0.01, 0)}>방향 ←</Button>
        <Button type="button" variant="secondary" disabled={disabled || !active.geometry.vectors[0]} aria-label="방향 오른쪽으로 이동" onClick={() => nudgeVector(0.01, 0)}>방향 →</Button>
        <Button type="button" variant="secondary" disabled={disabled || !active.geometry.vectors[0]} aria-label="방향 위로 이동" onClick={() => nudgeVector(0, -0.01)}>방향 ↑</Button>
        <Button type="button" variant="secondary" disabled={disabled || !active.geometry.vectors[0]} aria-label="방향 아래로 이동" onClick={() => nudgeVector(0, 0.01)}>방향 ↓</Button>
      </div>
      <p className="mt-2 text-xs text-[var(--app-muted)]">한 번에 1%씩, 서버의 안전 범위 안에서만 이동합니다. 드래그 없이 키보드와 터치로 동일하게 조정할 수 있습니다.</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="secondary" disabled={disabled} onClick={() => void onPatch({ state: active.state === "enabled" ? "disabled_by_user" : "enabled" })}>{active.state === "enabled" ? "이 모듈 사용 안 함" : "이 모듈 다시 사용"}</Button>
    </div>
  </div>;
}
