"use client";

import type { ReactNode } from "react";
import { Button } from "../../ui/Button";
import { Panel, SurfaceCard } from "../../ui/Surface";

export { Panel, SurfaceCard };

export function WorkbenchGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:items-start">{children}</div>;
}

export function SaveStageButton({ loading, onClick, children = "저장하고 다음 단계 열기", disabled = false }: { loading: boolean; onClick: () => void; children?: ReactNode; disabled?: boolean }) {
  return <Button type="button" loading={loading} disabled={disabled} onClick={onClick} className="min-h-12">{children}</Button>;
}

export function ChoiceGroup({ label, values, selected, onToggle, multiple = true }: { label: string; values: string[]; selected: string[]; onToggle: (value: string) => void; multiple?: boolean }) {
  return <fieldset className="grid gap-3"><legend className="text-sm font-black">{label}</legend><div className="flex flex-wrap gap-2">{values.map((value) => { const active = selected.includes(value); return <button key={value} type="button" onClick={() => onToggle(value)} aria-pressed={active} className={`min-h-11 border px-4 py-2 text-sm font-bold transition ${active ? "border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : "border-[var(--app-border)] bg-[var(--app-surface)] hover:border-[var(--app-border-strong)]"}`}>{value}</button>; })}</div>{!multiple ? <p className="text-xs text-[var(--app-muted)]">하나만 선택할 수 있습니다.</p> : null}</fieldset>;
}

export function TextField({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="grid gap-2 text-sm font-black">{label}<textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={3} className="app-input w-full resize-y px-3 py-3 text-sm font-normal leading-6" /></label>;
}

export function DefinitionRows({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return <dl className="grid gap-3">{items.map((item) => <div key={item.label} className="grid gap-1 border-b border-[var(--app-border)] pb-3"><dt className="text-xs font-black uppercase tracking-[0.04em] text-[var(--app-muted)]">{item.label}</dt><dd className="m-0 text-sm font-bold">{item.value}</dd></div>)}</dl>;
}
