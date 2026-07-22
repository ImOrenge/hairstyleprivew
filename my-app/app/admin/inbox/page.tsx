"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../../components/ui/Button";

const INBOUND_STATUSES = ["new", "read", "archived"] as const;
const OUTBOUND_STATUSES = ["sent", "failed", "skipped"] as const;
const MAILBOXES = ["support", "business", "general"] as const;

type MailMode = "inbound" | "outbound";
type EmailStatus = (typeof INBOUND_STATUSES)[number];
type OutboundEmailStatus = (typeof OUTBOUND_STATUSES)[number];
type InboundMailbox = (typeof MAILBOXES)[number];

const BUSINESS_INBOUND_EMAIL = "busyness@hairfit.beauty";

const statusLabels: Record<EmailStatus, string> = {
  new: "신규",
  read: "읽음",
  archived: "보관됨",
};

const outboundStatusLabels: Record<OutboundEmailStatus, string> = {
  sent: "발송됨",
  failed: "실패",
  skipped: "스킵",
};

const mailboxLabels: Record<InboundMailbox, string> = {
  support: "지원",
  business: "비즈니스",
  general: "일반",
};

const sourceLabels: Record<string, string> = {
  app: "앱",
  care: "사후관리",
  payment_failure: "결제 실패",
  payment_success: "결제 완료",
  refund_completed: "환불 완료",
  refund_review: "환불 검토",
  subscription_renewal: "구독 갱신",
  support_reply: "고객지원 답변",
  welcome_member: "회원 가입",
  welcome_salon: "살롱 가입",
};

interface AttachmentMeta {
  filename?: string | null;
  contentType?: string | null;
  disposition?: string | null;
  contentId?: string | null;
  size?: number | null;
}

interface InboundEmail {
  id: string;
  provider: string;
  mailbox: InboundMailbox;
  message_id: string | null;
  envelope_from: string;
  envelope_to: string;
  header_from: string | null;
  header_to: string[];
  subject: string;
  text_body: string | null;
  html_body: string | null;
  body_preview: string;
  attachments: AttachmentMeta[];
  status: EmailStatus;
  admin_note: string | null;
  in_reply_to: string | null;
  reference_ids: string[];
  raw_size: number;
  received_at: string;
  created_at: string;
  updated_at: string;
}

interface OutboundEmail {
  id: string;
  provider: string;
  provider_message_id: string | null;
  source: string;
  from_email: string;
  to_emails: string[];
  to_email_text: string;
  subject: string;
  text_body: string | null;
  html_body: string | null;
  body_preview: string;
  status: OutboundEmailStatus;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

interface StatusSummary {
  status: EmailStatus;
  count: number;
}

interface OutboundStatusSummary {
  status: OutboundEmailStatus;
  count: number;
}

interface MailboxSummary {
  mailbox: InboundMailbox;
  count: number;
}

interface SourceSummary {
  source: string;
  count: number;
}

interface InboxResponse {
  emails?: InboundEmail[];
  total?: number;
  statusSummary?: StatusSummary[];
  mailboxSummary?: MailboxSummary[];
  nextCursor?: string | null;
  error?: string;
}

interface OutboundInboxResponse {
  emails?: OutboundEmail[];
  total?: number;
  statusSummary?: OutboundStatusSummary[];
  sourceSummary?: SourceSummary[];
  nextCursor?: string | null;
  error?: string;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function sourceLabel(source: string) {
  return sourceLabels[source] || "기타 발송";
}

export default function AdminInboxPage() {
  const [mode, setMode] = useState<MailMode>("inbound");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | EmailStatus>("all");
  const [outboundStatusFilter, setOutboundStatusFilter] = useState<"all" | OutboundEmailStatus>("all");
  const [mailboxFilter, setMailboxFilter] = useState<"all" | InboundMailbox>("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [emails, setEmails] = useState<InboundEmail[]>([]);
  const [outboundEmails, setOutboundEmails] = useState<OutboundEmail[]>([]);
  const [total, setTotal] = useState(0);
  const [outboundTotal, setOutboundTotal] = useState(0);
  const [inboundNextCursor, setInboundNextCursor] = useState<string | null>(null);
  const [outboundNextCursor, setOutboundNextCursor] = useState<string | null>(null);
  const [statusSummary, setStatusSummary] = useState<StatusSummary[]>([]);
  const [outboundStatusSummary, setOutboundStatusSummary] = useState<OutboundStatusSummary[]>([]);
  const [mailboxSummary, setMailboxSummary] = useState<MailboxSummary[]>([]);
  const [sourceSummary, setSourceSummary] = useState<SourceSummary[]>([]);
  const [selection, setSelection] = useState<{ id: string | null; status: EmailStatus; note: string }>({
    id: null,
    status: "new",
    note: "",
  });
  const [outboundSelectionId, setOutboundSelectionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inboundAbortController = useRef<AbortController | null>(null);
  const outboundAbortController = useRef<AbortController | null>(null);

  const inboundListUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }
    if (mailboxFilter !== "all") {
      params.set("mailbox", mailboxFilter);
    }
    params.set("limit", "120");
    return `/api/admin/inbound-emails?${params.toString()}`;
  }, [mailboxFilter, query, statusFilter]);

  const outboundListUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (outboundStatusFilter !== "all") {
      params.set("status", outboundStatusFilter);
    }
    if (sourceFilter !== "all") {
      params.set("source", sourceFilter);
    }
    params.set("limit", "120");
    return `/api/admin/outbound-emails?${params.toString()}`;
  }, [outboundStatusFilter, query, sourceFilter]);

  const selectedEmail = useMemo(
    () => emails.find((email) => email.id === selection.id) ?? emails[0] ?? null,
    [emails, selection.id],
  );

  const selectedOutboundEmail = useMemo(
    () => outboundEmails.find((email) => email.id === outboundSelectionId) ?? outboundEmails[0] ?? null,
    [outboundEmails, outboundSelectionId],
  );

  const loadInboundEmails = useCallback(async (cursor?: string) => {
    inboundAbortController.current?.abort();
    const controller = new AbortController();
    inboundAbortController.current = controller;
    setIsLoading(true);
    setError(null);

    try {
      const url = new URL(inboundListUrl, window.location.origin);
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await fetch(`${url.pathname}${url.search}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => ({}))) as InboxResponse;
      if (!response.ok) {
        setError(
          response.status === 401 || response.status === 403
            ? "관리자 권한을 확인한 뒤 다시 시도해 주세요."
            : "수신 메일을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }

      const nextEmails = data.emails || [];
      setEmails((current) => (cursor ? [...current, ...nextEmails] : nextEmails));
      if (!cursor) setTotal(data.total ?? nextEmails.length);
      setInboundNextCursor(data.nextCursor || null);
      setStatusSummary(data.statusSummary || []);
      setMailboxSummary(data.mailboxSummary || []);
      setSelection((current) => {
        if (cursor && current.id) return current;
        const nextEmail =
          (current.id ? nextEmails.find((email) => email.id === current.id) : null) ?? nextEmails[0] ?? null;
        return {
          id: nextEmail?.id ?? null,
          status: nextEmail?.status ?? "new",
          note: nextEmail?.admin_note || "",
        };
      });
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError("수신 메일 네트워크 요청에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [inboundListUrl]);

  const loadOutboundEmails = useCallback(async (cursor?: string) => {
    outboundAbortController.current?.abort();
    const controller = new AbortController();
    outboundAbortController.current = controller;
    setIsLoading(true);
    setError(null);

    try {
      const url = new URL(outboundListUrl, window.location.origin);
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await fetch(`${url.pathname}${url.search}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => ({}))) as OutboundInboxResponse;
      if (!response.ok) {
        setError(
          response.status === 401 || response.status === 403
            ? "관리자 권한을 확인한 뒤 다시 시도해 주세요."
            : "보낸 메일을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }

      const nextEmails = data.emails || [];
      setOutboundEmails((current) => (cursor ? [...current, ...nextEmails] : nextEmails));
      if (!cursor) setOutboundTotal(data.total ?? nextEmails.length);
      setOutboundNextCursor(data.nextCursor || null);
      setOutboundStatusSummary(data.statusSummary || []);
      setSourceSummary(data.sourceSummary || []);
      setOutboundSelectionId((current) => {
        if (cursor && current) return current;
        return (current ? nextEmails.find((email) => email.id === current)?.id : null) ?? nextEmails[0]?.id ?? null;
      });
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError("보낸 메일 네트워크 요청에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [outboundListUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (mode === "inbound") {
        void loadInboundEmails();
      } else {
        void loadOutboundEmails();
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      inboundAbortController.current?.abort();
      outboundAbortController.current?.abort();
    };
  }, [loadInboundEmails, loadOutboundEmails, mode]);

  async function updateEmail(emailId: string, updates: { status?: EmailStatus; adminNote?: string }) {
    setBusyId(emailId);
    setError(null);

    try {
      const response = await fetch(`/api/admin/inbound-emails/${encodeURIComponent(emailId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = (await response.json().catch(() => ({}))) as { email?: InboundEmail };
      if (!response.ok || !data.email) {
        setError("수신 메일 상태를 변경하지 못했습니다. 최신 목록을 확인한 뒤 다시 시도해 주세요.");
        return;
      }

      setEmails((current) => current.map((email) => (email.id === emailId ? data.email! : email)));
      setSelection((current) =>
        current.id === emailId
          ? { id: emailId, status: data.email!.status, note: data.email!.admin_note || "" }
          : current,
      );
    } catch {
      setError("수신 메일 상태 변경 중 네트워크 문제가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setBusyId(null);
    }
  }

  const inboundDetailText = selectedEmail?.text_body || selectedEmail?.html_body || "";
  const outboundDetailText = selectedOutboundEmail?.text_body || selectedOutboundEmail?.html_body || "";
  const visibleSources = sourceSummary.length
    ? sourceSummary
    : sourceFilter !== "all"
      ? [{ source: sourceFilter, count: 0 }]
      : [];

  return (
    <div className="space-y-4 pb-10">
      <header className="rounded-2xl border border-stone-200 bg-white p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">관리자 메일함</p>
        <h1 className="mt-2 text-2xl font-black text-stone-950">
          {mode === "inbound" ? "수신 메일" : "보낸 메일"}
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          {mode === "inbound"
            ? `현재 ${emails.length.toLocaleString("ko-KR")} / 총 ${total.toLocaleString("ko-KR")}건 · 비즈니스 수신 ${BUSINESS_INBOUND_EMAIL}`
            : `현재 ${outboundEmails.length.toLocaleString("ko-KR")} / 총 ${outboundTotal.toLocaleString("ko-KR")}건 · HairFit 앱 발송 기록`}
        </p>
        <p className="mt-1 text-xs leading-5 text-stone-500">
          {mode === "inbound"
            ? "수신 메일을 조회하고 읽음·보관 상태와 관리자 메모를 변경할 수 있습니다."
            : "보낸 메일은 발송 결과를 확인하는 조회 전용 기록입니다."}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            className="h-9 rounded-lg px-3 text-xs"
            variant={mode === "inbound" ? "primary" : "secondary"}
            onClick={() => setMode("inbound")}
          >
            받은 메일
          </Button>
          <Button
            type="button"
            className="h-9 rounded-lg px-3 text-xs"
            variant={mode === "outbound" ? "primary" : "secondary"}
            onClick={() => setMode("outbound")}
          >
            보낸 메일
          </Button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px]">
          <input
            aria-label={mode === "inbound" ? "수신 메일 검색" : "보낸 메일 검색"}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              mode === "inbound"
                ? "보낸 사람 / 받는 사람 / 제목 / 미리보기 검색"
                : "받는 사람 / 제목 / 유형 / 미리보기 검색"
            }
            className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-900"
          />
          {mode === "inbound" ? (
            <select
              aria-label="수신 메일 상태 필터"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "all" | EmailStatus)}
              className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-900"
            >
              <option value="all">전체 상태</option>
              {INBOUND_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          ) : (
            <select
              aria-label="보낸 메일 상태 필터"
              value={outboundStatusFilter}
              onChange={(event) => setOutboundStatusFilter(event.target.value as "all" | OutboundEmailStatus)}
              className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-900"
            >
              <option value="all">전체 상태</option>
              {OUTBOUND_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {outboundStatusLabels[status]}
                </option>
              ))}
            </select>
          )}
          {mode === "inbound" ? (
            <select
              aria-label="수신함 필터"
              value={mailboxFilter}
              onChange={(event) => setMailboxFilter(event.target.value as "all" | InboundMailbox)}
              className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-900"
            >
              <option value="all">전체 수신함</option>
              {MAILBOXES.map((mailbox) => (
                <option key={mailbox} value={mailbox}>
                  {mailboxLabels[mailbox]}
                </option>
              ))}
            </select>
          ) : (
            <select
              aria-label="보낸 메일 유형 필터"
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
              className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-900"
            >
              <option value="all">전체 유형</option>
              {visibleSources.map((item) => (
                <option key={item.source} value={item.source}>
                  {sourceLabel(item.source)}
                </option>
              ))}
            </select>
          )}
        </div>

        {mode === "inbound" ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {INBOUND_STATUSES.map((status) => (
              <div key={status} className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
                <p className="font-semibold text-stone-700">{statusLabels[status]}</p>
                <p className="text-lg font-black text-stone-900">
                  {statusSummary.find((item) => item.status === status)?.count || 0}
                </p>
              </div>
            ))}
            {MAILBOXES.map((mailbox) => (
              <div key={mailbox} className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
                <p className="font-semibold text-stone-700">{mailboxLabels[mailbox]}</p>
                <p className="text-lg font-black text-stone-900">
                  {mailboxSummary.find((item) => item.mailbox === mailbox)?.count || 0}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {OUTBOUND_STATUSES.map((status) => (
              <div key={status} className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
                <p className="font-semibold text-stone-700">{outboundStatusLabels[status]}</p>
                <p className="text-lg font-black text-stone-900">
                  {outboundStatusSummary.find((item) => item.status === status)?.count || 0}
                </p>
              </div>
            ))}
            {sourceSummary.slice(0, 3).map((item) => (
              <div key={item.source} className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
                <p className="font-semibold text-stone-700">{sourceLabel(item.source)}</p>
                <p className="text-lg font-black text-stone-900">{item.count}</p>
              </div>
            ))}
          </div>
        )}
      </header>

      {error ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      {mode === "inbound" ? (
        <section className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]" aria-busy={isLoading}>
          <div className="space-y-2">
            {isLoading && emails.length === 0 ? (
              <p className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-sm text-stone-500">
                메일을 불러오는 중...
              </p>
            ) : null}
            {!isLoading && emails.length === 0 ? (
              <p className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-sm text-stone-500">
                아직 수신 메일이 없습니다.
              </p>
            ) : null}

            {emails.map((email) => (
              <button
                type="button"
                key={email.id}
                onClick={() =>
                  setSelection({
                    id: email.id,
                    status: email.status,
                    note: email.admin_note || "",
                  })
                }
                className={`w-full rounded-2xl border bg-white p-4 text-left transition ${
                  selectedEmail?.id === email.id
                    ? "border-stone-950 shadow-sm"
                    : "border-stone-200 hover:border-stone-400"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-stone-950">{email.subject || "(제목 없음)"}</p>
                    <p className="mt-1 truncate text-xs text-stone-500">{email.header_from || email.envelope_from}</p>
                  </div>
                  <span className="rounded-full border border-stone-200 px-2 py-1 text-[11px] font-bold uppercase text-stone-500">
                    {mailboxLabels[email.mailbox]} · {statusLabels[email.status]}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-stone-600">{email.body_preview || "-"}</p>
                <p className="mt-2 text-xs text-stone-400">{formatDate(email.received_at)}</p>
              </button>
            ))}
            {inboundNextCursor ? (
              <Button
                type="button"
                variant="secondary"
                disabled={isLoading}
                onClick={() => void loadInboundEmails(inboundNextCursor)}
              >
                {isLoading ? "불러오는 중..." : "수신 메일 더 보기"}
              </Button>
            ) : null}
          </div>

          <article className="min-h-[520px] rounded-2xl border border-stone-200 bg-white p-5">
            {selectedEmail ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">
                      {selectedEmail.provider} · {mailboxLabels[selectedEmail.mailbox]}
                    </p>
                    <h2 className="mt-2 text-2xl font-black text-stone-950">
                      {selectedEmail.subject || "(제목 없음)"}
                    </h2>
                    <p className="mt-2 text-sm text-stone-600">
                      보낸 사람 {selectedEmail.header_from || selectedEmail.envelope_from}
                    </p>
                    <p className="mt-1 text-xs text-stone-400">
                      받는 사람 {selectedEmail.header_to.join(", ") || selectedEmail.envelope_to} /{" "}
                      {formatDate(selectedEmail.received_at)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="rounded-lg px-3 text-xs"
                      disabled={busyId === selectedEmail.id}
                      onClick={() => void updateEmail(selectedEmail.id, { status: "read" })}
                    >
                      읽음 처리
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="rounded-lg px-3 text-xs"
                      disabled={busyId === selectedEmail.id}
                      onClick={() => void updateEmail(selectedEmail.id, { status: "archived" })}
                    >
                      보관
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2 rounded-xl border border-stone-100 bg-stone-50 px-3 py-3 text-xs text-stone-600 md:grid-cols-2">
                  <p>
                    <span className="font-bold text-stone-900">수신함</span>
                    <br />
                    {mailboxLabels[selectedEmail.mailbox]}
                  </p>
                  <p>
                    <span className="font-bold text-stone-900">봉투 발신자</span>
                    <br />
                    {selectedEmail.envelope_from}
                  </p>
                  <p>
                    <span className="font-bold text-stone-900">봉투 수신자</span>
                    <br />
                    {selectedEmail.envelope_to}
                  </p>
                  <p>
                    <span className="font-bold text-stone-900">메시지 ID</span>
                    <br />
                    {selectedEmail.message_id || "-"}
                  </p>
                  <p>
                    <span className="font-bold text-stone-900">원본 크기</span>
                    <br />
                    {formatBytes(selectedEmail.raw_size)}
                  </p>
                </div>

                {selectedEmail.attachments.length ? (
                  <div className="rounded-xl border border-stone-100 bg-stone-50 px-3 py-3">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-stone-400">첨부파일</p>
                    <ul className="mt-2 grid gap-1 text-sm text-stone-700">
                      {selectedEmail.attachments.map((attachment, index) => (
                        <li key={`${attachment.filename || "attachment"}-${index}`}>
                          {attachment.filename || "(이름 없음)"} / {attachment.contentType || "알 수 없음"} /{" "}
                          {formatBytes(attachment.size || 0)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <pre className="max-h-[440px] overflow-auto whitespace-pre-wrap rounded-xl border border-stone-100 bg-stone-50 p-4 text-sm leading-6 text-stone-800">
                  {inboundDetailText || "본문 내용이 없습니다."}
                </pre>

                <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_96px]">
                  <select
                    aria-label="수신 메일 상태"
                    value={selection.status}
                    onChange={(event) =>
                      setSelection((current) => ({ ...current, status: event.target.value as EmailStatus }))
                    }
                    className="h-10 rounded-lg border border-stone-300 px-3 text-sm outline-none focus:border-stone-900"
                  >
                    {INBOUND_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status]}
                      </option>
                    ))}
                  </select>
                  <textarea
                    aria-label="수신 메일 관리자 메모"
                    rows={3}
                    value={selection.note}
                    onChange={(event) => setSelection((current) => ({ ...current, note: event.target.value }))}
                    placeholder="관리자 메모"
                    className="rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-900"
                  />
                  <Button
                    type="button"
                    className="h-10 rounded-lg px-3 text-xs"
                    disabled={busyId === selectedEmail.id}
                    onClick={() =>
                      void updateEmail(selectedEmail.id, { status: selection.status, adminNote: selection.note })
                    }
                  >
                    저장
                  </Button>
                </div>
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-stone-500">메일을 선택하세요.</p>
            )}
          </article>
        </section>
      ) : (
        <section className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]" aria-busy={isLoading}>
          <div className="space-y-2">
            {isLoading && outboundEmails.length === 0 ? (
              <p className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-sm text-stone-500">
                메일을 불러오는 중...
              </p>
            ) : null}
            {!isLoading && outboundEmails.length === 0 ? (
              <p className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-sm text-stone-500">
                아직 보낸 메일 기록이 없습니다.
              </p>
            ) : null}

            {outboundEmails.map((email) => (
              <button
                type="button"
                key={email.id}
                onClick={() => setOutboundSelectionId(email.id)}
                className={`w-full rounded-2xl border bg-white p-4 text-left transition ${
                  selectedOutboundEmail?.id === email.id
                    ? "border-stone-950 shadow-sm"
                    : "border-stone-200 hover:border-stone-400"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-stone-950">{email.subject || "(제목 없음)"}</p>
                    <p className="mt-1 truncate text-xs text-stone-500">
                      받는 사람 {email.to_email_text || email.to_emails.join(", ") || "-"}
                    </p>
                  </div>
                  <span className="rounded-full border border-stone-200 px-2 py-1 text-[11px] font-bold uppercase text-stone-500">
                    {sourceLabel(email.source)} · {outboundStatusLabels[email.status]}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-stone-600">{email.body_preview || "-"}</p>
                <p className="mt-2 text-xs text-stone-400">{formatDate(email.sent_at || email.created_at)}</p>
              </button>
            ))}
            {outboundNextCursor ? (
              <Button
                type="button"
                variant="secondary"
                disabled={isLoading}
                onClick={() => void loadOutboundEmails(outboundNextCursor)}
              >
                {isLoading ? "불러오는 중..." : "보낸 메일 더 보기"}
              </Button>
            ) : null}
          </div>

          <article className="min-h-[520px] rounded-2xl border border-stone-200 bg-white p-5">
            {selectedOutboundEmail ? (
              <div className="space-y-4">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">
                    {selectedOutboundEmail.provider} · {sourceLabel(selectedOutboundEmail.source)}
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-stone-950">
                    {selectedOutboundEmail.subject || "(제목 없음)"}
                  </h2>
                  <p className="mt-2 text-sm text-stone-600">보낸 사람 {selectedOutboundEmail.from_email}</p>
                  <p className="mt-1 text-xs text-stone-400">
                    받는 사람 {selectedOutboundEmail.to_email_text || selectedOutboundEmail.to_emails.join(", ") || "-"}{" "}
                    / {formatDate(selectedOutboundEmail.sent_at || selectedOutboundEmail.created_at)}
                  </p>
                </div>

                <div className="grid gap-2 rounded-xl border border-stone-100 bg-stone-50 px-3 py-3 text-xs text-stone-600 md:grid-cols-2">
                  <p>
                    <span className="font-bold text-stone-900">상태</span>
                    <br />
                    {outboundStatusLabels[selectedOutboundEmail.status]}
                  </p>
                  <p>
                    <span className="font-bold text-stone-900">발송 유형</span>
                    <br />
                    {sourceLabel(selectedOutboundEmail.source)}
                  </p>
                  <p>
                    <span className="font-bold text-stone-900">Resend ID</span>
                    <br />
                    {selectedOutboundEmail.provider_message_id || "-"}
                  </p>
                  <p>
                    <span className="font-bold text-stone-900">기록 생성</span>
                    <br />
                    {formatDate(selectedOutboundEmail.created_at)}
                  </p>
                </div>

                {selectedOutboundEmail.error_message ? (
                  <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                    발송 실패가 기록되었습니다. 상세 원인은 운영 로그에서 확인해 주세요.
                  </div>
                ) : null}

                <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl border border-stone-100 bg-stone-50 p-4 text-sm leading-6 text-stone-800">
                  {outboundDetailText || "본문 내용이 없습니다."}
                </pre>
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-stone-500">메일을 선택하세요.</p>
            )}
          </article>
        </section>
      )}
    </div>
  );
}
