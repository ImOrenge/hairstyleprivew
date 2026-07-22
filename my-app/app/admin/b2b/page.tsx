"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  plan_interest: string | null;
  region: string | null;
  shop_count: number | null;
  seat_count: number | null;
  monthly_clients: number | null;
  current_tools: string | null;
  desired_timeline: string | null;
  budget_range: string | null;
  source_page: string | null;
  webhook_delivered: boolean;
  webhook_error: string | null;
}

interface StageSummary {
  stage: LeadStage;
  count: number;
}

interface LeadListResponse {
  leads?: LeadRow[];
  total?: number;
  stageSummary?: StageSummary[];
  nextCursor?: string | null;
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

const stageLabels: Record<LeadStage, string> = {
  new: "신규",
  qualified: "검증 완료",
  negotiation: "협상 중",
  contracted: "계약 완료",
  dropped: "종료",
};

function sourceLabel(source: LeadRow["source"]) {
  return source === "public_form" ? "웹 문의" : "관리자 등록";
}

function webhookLabel(lead: LeadRow) {
  if (lead.webhook_delivered) return "전달 완료";
  if (lead.webhook_error) return "전달 실패 — 상세 로그 확인 필요";
  return "미전달";
}

export default function AdminB2BPage() {
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<"all" | LeadStage>("all");
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [stageSummary, setStageSummary] = useState<StageSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, LeadDraft>>({});
  const listAbortController = useRef<AbortController | null>(null);

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

  const loadLeads = useCallback(async (cursor?: string) => {
    listAbortController.current?.abort();
    const controller = new AbortController();
    listAbortController.current = controller;
    setIsLoading(true);
    setError(null);

    try {
      const url = new URL(listUrl, window.location.origin);
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await fetch(`${url.pathname}${url.search}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => ({}))) as LeadListResponse;
      if (!response.ok) {
        setError(
          response.status === 401 || response.status === 403
            ? "관리자 권한을 확인한 뒤 다시 시도해 주세요."
            : "B2B 리드 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }

      const nextLeads = data.leads || [];
      setLeads((current) => (cursor ? [...current, ...nextLeads] : nextLeads));
      if (!cursor) setTotal(data.total ?? nextLeads.length);
      setNextCursor(data.nextCursor || null);
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
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError("B2B 리드 목록 네트워크 요청에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [listUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadLeads();
    }, 180);

    return () => {
      window.clearTimeout(timer);
      listAbortController.current?.abort();
    };
  }, [loadLeads]);

  async function handleSave(leadId: string) {
    const draft = drafts[leadId];
    if (!draft) return;

    setBusyLeadId(leadId);
    setError(null);

    try {
      const response = await fetch(`/api/admin/b2b/leads/${encodeURIComponent(leadId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: draft.stage,
          ownerNote: draft.ownerNote,
          lastContactedAt: draft.lastContactedAt || null,
        }),
      });
      if (!response.ok) {
        setError("리드 변경사항을 저장하지 못했습니다. 최신 목록을 확인한 뒤 다시 시도해 주세요.");
      } else {
        await loadLeads();
      }
    } catch {
      setError("리드 저장 중 네트워크 문제가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setBusyLeadId(null);
    }
  }

  return (
    <div className="space-y-4 pb-10">
      <header className="rounded-2xl border border-stone-200 bg-white p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">관리자 대시보드</p>
        <h1 className="mt-2 text-2xl font-black text-stone-950">B2B</h1>
        <p className="mt-2 text-sm text-stone-600">
          현재 {leads.length.toLocaleString("ko-KR")} / 총 {total.toLocaleString("ko-KR")}건
        </p>
        <p className="mt-1 text-xs leading-5 text-stone-500">
          도입 문의를 조회하고 단계와 운영 메모를 변경할 수 있습니다. 저장 버튼을 눌러야 변경 내용이 반영됩니다.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <input
            aria-label="B2B 리드 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="회사명 / 담당자 / 이메일 검색"
            className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-900"
          />
          <select
            aria-label="B2B 리드 단계 필터"
            value={stageFilter}
            onChange={(event) => setStageFilter(event.target.value as "all" | LeadStage)}
            className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-900"
          >
            <option value="all">전체 단계</option>
            {STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stageLabels[stage]}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {STAGES.map((stage) => (
            <div key={stage} className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
              <p className="font-semibold text-stone-700">{stageLabels[stage]}</p>
              <p className="text-lg font-black text-stone-900">
                {stageSummary.find((item) => item.stage === stage)?.count || 0}
              </p>
            </div>
          ))}
        </div>
      </header>

      {error ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="space-y-3" aria-busy={isLoading}>
        {isLoading && leads.length === 0 ? <p className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-sm text-stone-500">불러오는 중...</p> : null}
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
                  접수: {formatDate(lead.created_at)} / 유입: {sourceLabel(lead.source)}
                </p>
              </div>
              <div className="w-full sm:max-w-[220px]">
                <select
                  aria-label={`${lead.company_name} 리드 단계`}
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
                      {stageLabels[stage]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-3 grid gap-2 rounded-lg border border-stone-100 bg-stone-50 px-3 py-3 text-xs text-stone-600 sm:grid-cols-2 lg:grid-cols-4">
              <p>
                <span className="font-bold text-stone-900">관심 플랜</span>
                <br />
                {lead.plan_interest || "-"}
              </p>
              <p>
                <span className="font-bold text-stone-900">지역</span>
                <br />
                {lead.region || "-"}
              </p>
              <p>
                <span className="font-bold text-stone-900">지점 / 좌석</span>
                <br />
                {lead.shop_count ?? "-"} / {lead.seat_count ?? "-"}
              </p>
              <p>
                <span className="font-bold text-stone-900">월 고객</span>
                <br />
                {lead.monthly_clients ?? "-"}
              </p>
              <p>
                <span className="font-bold text-stone-900">도입 시점</span>
                <br />
                {lead.desired_timeline || "-"}
              </p>
              <p>
                <span className="font-bold text-stone-900">예산</span>
                <br />
                {lead.budget_range || "-"}
              </p>
              <p className="sm:col-span-2">
                <span className="font-bold text-stone-900">현재 도구</span>
                <br />
                {lead.current_tools || "-"}
              </p>
              <p className="sm:col-span-2">
                <span className="font-bold text-stone-900">외부 전달</span>
                <br />
                {webhookLabel(lead)}
              </p>
              {lead.source_page ? (
                <p className="sm:col-span-2">
                  <span className="font-bold text-stone-900">유입 페이지</span>
                  <br />
                  {lead.source_page}
                </p>
              ) : null}
            </div>

            <p className="mt-3 whitespace-pre-wrap rounded-lg border border-stone-100 bg-stone-50 px-3 py-3 text-sm leading-6 text-stone-700">
              {lead.message}
            </p>

            <p className="mt-3 text-xs font-bold text-stone-600">아래 항목은 저장 버튼을 누르면 운영 정보가 변경됩니다.</p>
            <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_220px_96px]">
              <textarea
                aria-label={`${lead.company_name} 운영 메모`}
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
                aria-label={`${lead.company_name} 최근 연락 시각`}
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

        {nextCursor ? (
          <Button
            type="button"
            variant="secondary"
            disabled={isLoading}
            onClick={() => void loadLeads(nextCursor)}
          >
            {isLoading ? "불러오는 중..." : "B2B 리드 더 보기"}
          </Button>
        ) : null}
      </section>
    </div>
  );
}
