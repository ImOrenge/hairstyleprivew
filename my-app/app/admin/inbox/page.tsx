"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/ui/Button";

const STATUSES = ["new", "read", "archived"] as const;
type EmailStatus = (typeof STATUSES)[number];

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

interface StatusSummary {
  status: EmailStatus;
  count: number;
}

interface InboxResponse {
  emails?: InboundEmail[];
  total?: number;
  statusSummary?: StatusSummary[];
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

export default function AdminInboxPage() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | EmailStatus>("all");
  const [emails, setEmails] = useState<InboundEmail[]>([]);
  const [total, setTotal] = useState(0);
  const [statusSummary, setStatusSummary] = useState<StatusSummary[]>([]);
  const [selection, setSelection] = useState<{ id: string | null; status: EmailStatus; note: string }>({
    id: null,
    status: "new",
    note: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const listUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }
    params.set("limit", "120");
    return `/api/admin/inbound-emails?${params.toString()}`;
  }, [query, statusFilter]);

  const selectedEmail = useMemo(
    () => emails.find((email) => email.id === selection.id) ?? emails[0] ?? null,
    [emails, selection.id],
  );

  const loadEmails = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const response = await fetch(listUrl, { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as InboxResponse;
    if (!response.ok) {
      setError(data.error || "Failed to load inbound emails.");
      setIsLoading(false);
      return;
    }

    const nextEmails = data.emails || [];
    setEmails(nextEmails);
    setTotal(data.total || nextEmails.length);
    setStatusSummary(data.statusSummary || []);
    setSelection((current) => {
      const nextEmail =
        (current.id ? nextEmails.find((email) => email.id === current.id) : null) ?? nextEmails[0] ?? null;
      return {
        id: nextEmail?.id ?? null,
        status: nextEmail?.status ?? "new",
        note: nextEmail?.admin_note || "",
      };
    });
    setIsLoading(false);
  }, [listUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadEmails();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [loadEmails]);

  async function updateEmail(emailId: string, updates: { status?: EmailStatus; adminNote?: string }) {
    setBusyId(emailId);
    setError(null);

    const response = await fetch(`/api/admin/inbound-emails/${encodeURIComponent(emailId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const data = (await response.json().catch(() => ({}))) as { email?: InboundEmail; error?: string };
    if (!response.ok || !data.email) {
      setError(data.error || "Failed to update inbound email.");
      setBusyId(null);
      return;
    }

    setEmails((current) => current.map((email) => (email.id === emailId ? data.email! : email)));
    setSelection((current) =>
      current.id === emailId
        ? { id: emailId, status: data.email!.status, note: data.email!.admin_note || "" }
        : current,
    );
    setBusyId(null);
  }

  const detailText = selectedEmail?.text_body || selectedEmail?.html_body || "";

  return (
    <div className="space-y-4 pb-10">
      <header className="rounded-2xl border border-stone-200 bg-white p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Admin Inbox</p>
        <h1 className="mt-2 text-2xl font-black text-stone-950">Inbound email</h1>
        <p className="mt-2 text-sm text-stone-600">Total {total} messages routed from Cloudflare Email Routing.</p>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sender, recipient, subject, preview"
            className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-900"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | EmailStatus)}
            className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-900"
          >
            <option value="all">All statuses</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {STATUSES.map((status) => (
            <div key={status} className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
              <p className="font-semibold text-stone-700">{status}</p>
              <p className="text-lg font-black text-stone-900">
                {statusSummary.find((item) => item.status === status)?.count || 0}
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

      <section className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-2">
          {isLoading ? (
            <p className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-sm text-stone-500">Loading messages...</p>
          ) : null}
          {!isLoading && emails.length === 0 ? (
            <p className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-sm text-stone-500">No inbound emails yet.</p>
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
                selectedEmail?.id === email.id ? "border-stone-950 shadow-sm" : "border-stone-200 hover:border-stone-400"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-stone-950">{email.subject || "(no subject)"}</p>
                  <p className="mt-1 truncate text-xs text-stone-500">{email.header_from || email.envelope_from}</p>
                </div>
                <span className="rounded-full border border-stone-200 px-2 py-1 text-[11px] font-bold uppercase text-stone-500">
                  {email.status}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-stone-600">{email.body_preview || "-"}</p>
              <p className="mt-2 text-xs text-stone-400">{formatDate(email.received_at)}</p>
            </button>
          ))}
        </div>

        <article className="min-h-[520px] rounded-2xl border border-stone-200 bg-white p-5">
          {selectedEmail ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">
                    {selectedEmail.provider}
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-stone-950">{selectedEmail.subject || "(no subject)"}</h2>
                  <p className="mt-2 text-sm text-stone-600">
                    From {selectedEmail.header_from || selectedEmail.envelope_from}
                  </p>
                  <p className="mt-1 text-xs text-stone-400">
                    To {selectedEmail.header_to.join(", ") || selectedEmail.envelope_to} / {formatDate(selectedEmail.received_at)}
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
                    Mark read
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="rounded-lg px-3 text-xs"
                    disabled={busyId === selectedEmail.id}
                    onClick={() => void updateEmail(selectedEmail.id, { status: "archived" })}
                  >
                    Archive
                  </Button>
                </div>
              </div>

              <div className="grid gap-2 rounded-xl border border-stone-100 bg-stone-50 px-3 py-3 text-xs text-stone-600 md:grid-cols-2">
                <p>
                  <span className="font-bold text-stone-900">Envelope from</span>
                  <br />
                  {selectedEmail.envelope_from}
                </p>
                <p>
                  <span className="font-bold text-stone-900">Envelope to</span>
                  <br />
                  {selectedEmail.envelope_to}
                </p>
                <p>
                  <span className="font-bold text-stone-900">Message ID</span>
                  <br />
                  {selectedEmail.message_id || "-"}
                </p>
                <p>
                  <span className="font-bold text-stone-900">Raw size</span>
                  <br />
                  {formatBytes(selectedEmail.raw_size)}
                </p>
              </div>

              {selectedEmail.attachments.length ? (
                <div className="rounded-xl border border-stone-100 bg-stone-50 px-3 py-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-stone-400">Attachments</p>
                  <ul className="mt-2 grid gap-1 text-sm text-stone-700">
                    {selectedEmail.attachments.map((attachment, index) => (
                      <li key={`${attachment.filename || "attachment"}-${index}`}>
                        {attachment.filename || "(unnamed)"} / {attachment.contentType || "unknown"} /{" "}
                        {formatBytes(attachment.size || 0)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <pre className="max-h-[440px] overflow-auto whitespace-pre-wrap rounded-xl border border-stone-100 bg-stone-50 p-4 text-sm leading-6 text-stone-800">
                {detailText || "No body content."}
              </pre>

              <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_96px]">
                <select
                  value={selection.status}
                  onChange={(event) =>
                    setSelection((current) => ({ ...current, status: event.target.value as EmailStatus }))
                  }
                  className="h-10 rounded-lg border border-stone-300 px-3 text-sm outline-none focus:border-stone-900"
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <textarea
                  rows={3}
                  value={selection.note}
                  onChange={(event) => setSelection((current) => ({ ...current, note: event.target.value }))}
                  placeholder="Admin note"
                  className="rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-900"
                />
                <Button
                  type="button"
                  className="h-10 rounded-lg px-3 text-xs"
                  disabled={busyId === selectedEmail.id}
                  onClick={() => void updateEmail(selectedEmail.id, { status: selection.status, adminNote: selection.note })}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-stone-500">Select a message.</p>
          )}
        </article>
      </section>
    </div>
  );
}
