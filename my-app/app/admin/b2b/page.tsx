"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/ui/Button";

const STAGES = ["new", "qualified", "negotiation", "contracted", "dropped"] as const;
type LeadStage = (typeof STAGES)[number];

interface LeadRow {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  message: string;
  stage: LeadStage;
  source: "public_form" | "admin_manual";
  owner_admin_user_id: string | null;
  owner_note: string | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface StageSummary {
  stage: LeadStage;
  count: number;
}

interface LeadListResponse {
  leads?: LeadRow[];
  total?: number;
  stageSummary?: StageSummary[];
  error?: string;
}

interface LeadDraft {
  stage: LeadStage;
  ownerNote: string;
  lastContactedAt: string;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function toDateTimeLocal(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function AdminB2BPage() {
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<"all" | LeadStage>("all");
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [stageSummary, setStageSummary] = useState<StageSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, LeadDraft>>({});

  const listUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (stageFilter !== "all") {
      params.set("stage", stageFilter);
    }
    params.set("limit", "120");
    return `/api/admin/b2b/leads?${params.toString()}`;
  }, [query, stageFilter]);

  const loadLeads = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const response = await fetch(listUrl, { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as LeadListResponse;
    if (!response.ok) {
      setError(data.error || "B2B 리드 목록을 불러오지 못했습니다.");
      setIsLoading(false);
      return;
    }

    const nextLeads = data.leads || [];
    setLeads(nextLeads);
    setTotal(data.total || nextLeads.length);
    setStageSummary(data.stageSummary || []);
    setDrafts((current) => {
      const merged = { ...current };
      for (const lead of nextLeads) {
        merged[lead.id] = {
          stage: merged[lead.id]?.stage || lead.stage,
          ownerNote: merged[lead.id]?.ownerNote ?? lead.owner_note ?? "",
          lastContactedAt: merged[lead.id]?.lastContactedAt ?? toDateTimeLocal(lead.last_contacted_at),
        };
      }
      return merged;
    });
    setIsLoading(false);
  }, [listUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadLeads();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [loadLeads]);

  async function handleSave(leadId: string) {
    const draft = drafts[leadId];
    if (!draft) return;

    setBusyLeadId(leadId);
    setError(null);

    const response = await fetch(`/api/admin/b2b/leads/${encodeURIComponent(leadId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage: draft.stage,
        ownerNote: draft.ownerNote,
        lastContactedAt: draft.lastContactedAt || null,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(data.error || "리드 저장에 실패했습니다.");
    } else {
      await loadLeads();
    }

    setBusyLeadId(null);
  }

  return (
    <div className="space-y-4 pb-10">
      <header className="rounded-2xl border border-stone-200 bg-white p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Admin Dashboard</p>
        <h1 className="mt-2 text-2xl font-black text-stone-950">B2B</h1>
        <p className="mt-2 text-sm text-stone-600">총 {total}건</p>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="회사명 / 담당자 / 이메일 검색"
            className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-900"
          />
          <select
            value={stageFilter}
            onChange={(event) => setStageFilter(event.target.value as "all" | LeadStage)}
            className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-900"
          >
            <option value="all">전체 단계</option>
            {STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-5">
          {STAGES.map((stage) => (
            <div key={stage} className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
              <p className="font-semibold text-stone-700">{stage}</p>
              <p className="text-lg font-black text-stone-900">
                {stageSummary.find((item) => item.stage === stage)?.count || 0}
              </p>
            </div>
          ))}
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="space-y-3">
        {isLoading ? <p className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-sm text-stone-500">불러오는 중...</p> : null}
        {!isLoading && leads.length === 0 ? (
          <p className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-sm text-stone-500">리드가 없습니다.</p>
        ) : null}

        {leads.map((lead) => (
          <article key={lead.id} className="rounded-2xl border border-stone-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-black text-stone-950">{lead.company_name}</p>
                <p className="mt-1 text-sm text-stone-600">
                  {lead.contact_name} · {lead.email} {lead.phone ? `· ${lead.phone}` : ""}
                </p>
                <p className="mt-1 text-xs text-stone-400">
                  접수: {formatDate(lead.created_at)} / 소스: {lead.source}
                </p>
              </div>
              <div className="w-full max-w-[220px]">
                <select
                  value={drafts[lead.id]?.stage || lead.stage}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [lead.id]: {
                        ...(current[lead.id] || {
                          stage: lead.stage,
                          ownerNote: lead.owner_note || "",
                          lastContactedAt: toDateTimeLocal(lead.last_contacted_at),
                        }),
                        stage: event.target.value as LeadStage,
                      },
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-stone-300 px-3 text-sm outline-none focus:border-stone-900"
                >
                  {STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="mt-3 whitespace-pre-wrap rounded-lg border border-stone-100 bg-stone-50 px-3 py-3 text-sm leading-6 text-stone-700">
              {lead.message}
            </p>

            <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_220px_96px]">
              <textarea
                rows={3}
                value={drafts[lead.id]?.ownerNote ?? lead.owner_note ?? ""}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [lead.id]: {
                      ...(current[lead.id] || {
                        stage: lead.stage,
                        ownerNote: lead.owner_note || "",
                        lastContactedAt: toDateTimeLocal(lead.last_contacted_at),
                      }),
                      ownerNote: event.target.value,
                    },
                  }))
                }
                placeholder="운영 메모"
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-900"
              />
              <input
                type="datetime-local"
                value={drafts[lead.id]?.lastContactedAt ?? toDateTimeLocal(lead.last_contacted_at)}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [lead.id]: {
                      ...(current[lead.id] || {
                        stage: lead.stage,
                        ownerNote: lead.owner_note || "",
                        lastContactedAt: toDateTimeLocal(lead.last_contacted_at),
                      }),
                      lastContactedAt: event.target.value,
                    },
                  }))
                }
                className="h-10 rounded-lg border border-stone-300 px-3 text-sm outline-none focus:border-stone-900"
              />
              <Button
                type="button"
                className="h-10 rounded-lg px-3 text-xs"
                disabled={busyLeadId === lead.id}
                onClick={() => void handleSave(lead.id)}
              >
                저장
              </Button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
