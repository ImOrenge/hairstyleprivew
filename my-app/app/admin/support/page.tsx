"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/ui/Button";
import {
  SUPPORT_POST_KIND_LABELS,
  SUPPORT_POST_KINDS,
  SUPPORT_POST_STATUS_LABELS,
  SUPPORT_POST_STATUSES,
  type SupportPostKind,
  type SupportPostStatus,
} from "../../../lib/support-types";

interface AdminSupportPost {
  id: string;
  kind: SupportPostKind;
  status: SupportPostStatus;
  title: string;
  body: string;
  author_user_id: string;
  author_display_name: string;
  admin_answer: string | null;
  admin_answered_at: string | null;
  is_hidden: boolean;
  hidden_reason: string | null;
  hidden_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SupportFaq {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

interface PostsResponse {
  posts?: AdminSupportPost[];
  total?: number;
  error?: string;
}

interface FaqsResponse {
  faqs?: SupportFaq[];
  faq?: SupportFaq;
  error?: string;
}

type EmailNotification =
  | { attempted: false; sent: false; reason: string }
  | { attempted: true; sent: false; error: string }
  | { attempted: true; sent: true; providerId: string | null };

interface SavePostResponse {
  post?: AdminSupportPost;
  emailNotification?: EmailNotification;
  error?: string;
}

const visibilityOptions = [
  { value: "all", label: "전체" },
  { value: "visible", label: "공개" },
  { value: "hidden", label: "숨김" },
  { value: "deleted", label: "삭제됨" },
] as const;

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function emptyFaqForm() {
  return {
    question: "",
    answer: "",
    category: "general",
    sortOrder: "100",
    isPublished: true,
  };
}

function supportEmailNotificationMessage(notification?: EmailNotification) {
  if (!notification) return null;

  if (notification.attempted) {
    if (notification.sent) {
      return { tone: "success" as const, text: "답변을 저장하고 고객에게 메일을 발송했습니다." };
    }

    return { tone: "warning" as const, text: `답변은 저장됐지만 메일 발송에 실패했습니다. ${notification.error}` };
  }

  if (notification.reason === "author_email_missing") {
    return { tone: "warning" as const, text: "답변은 저장됐지만 작성자 이메일이 없어 메일을 보내지 못했습니다." };
  }

  if (notification.reason === "author_lookup_failed") {
    return { tone: "warning" as const, text: "답변은 저장됐지만 작성자 정보를 불러오지 못해 메일을 보내지 못했습니다." };
  }

  return null;
}

export default function AdminSupportPage() {
  const [mode, setMode] = useState<"posts" | "faqs">("posts");
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | SupportPostKind>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | SupportPostStatus>("all");
  const [visibilityFilter, setVisibilityFilter] = useState<(typeof visibilityOptions)[number]["value"]>("all");
  const [posts, setPosts] = useState<AdminSupportPost[]>([]);
  const [postTotal, setPostTotal] = useState(0);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [postEditor, setPostEditor] = useState({
    status: "received" as SupportPostStatus,
    adminAnswer: "",
    hidden: false,
    hiddenReason: "",
  });
  const [faqs, setFaqs] = useState<SupportFaq[]>([]);
  const [selectedFaqId, setSelectedFaqId] = useState<string | null>(null);
  const [faqForm, setFaqForm] = useState(emptyFaqForm);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const postsUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (kindFilter !== "all") params.set("kind", kindFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (visibilityFilter !== "all") params.set("visibility", visibilityFilter);
    params.set("limit", "120");
    return `/api/admin/support/posts?${params.toString()}`;
  }, [kindFilter, query, statusFilter, visibilityFilter]);

  const selectedPost = useMemo(
    () => posts.find((post) => post.id === selectedPostId) ?? posts[0] ?? null,
    [posts, selectedPostId],
  );

  const loadPosts = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const response = await fetch(postsUrl, { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as PostsResponse;
    if (!response.ok) {
      setError(data.error || "고객지원 게시글을 불러오지 못했습니다.");
      setIsLoading(false);
      return;
    }

    const nextPosts = data.posts || [];
    setPosts(nextPosts);
    setPostTotal(data.total || nextPosts.length);
    setSelectedPostId(nextPosts[0]?.id ?? null);
    if (nextPosts[0]) {
      setPostEditor({
        status: nextPosts[0].status,
        adminAnswer: nextPosts[0].admin_answer || "",
        hidden: nextPosts[0].is_hidden,
        hiddenReason: nextPosts[0].hidden_reason || "",
      });
    }
    setIsLoading(false);
  }, [postsUrl]);

  const loadFaqs = useCallback(async () => {
    setError(null);
    const response = await fetch("/api/admin/support/faqs", { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as FaqsResponse;
    if (!response.ok) {
      setError(data.error || "FAQ를 불러오지 못했습니다.");
      return;
    }
    setFaqs(data.faqs || []);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPosts();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [loadPosts]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadFaqs();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [loadFaqs]);

  function selectPost(post: AdminSupportPost) {
    setSelectedPostId(post.id);
    setPostEditor({
      status: post.status,
      adminAnswer: post.admin_answer || "",
      hidden: post.is_hidden,
      hiddenReason: post.hidden_reason || "",
    });
  }

  function selectFaq(faq: SupportFaq) {
    setSelectedFaqId(faq.id);
    setFaqForm({
      question: faq.question,
      answer: faq.answer,
      category: faq.category,
      sortOrder: String(faq.sort_order),
      isPublished: faq.is_published,
    });
  }

  async function saveSelectedPost() {
    if (!selectedPost) return;
    setBusyId(selectedPost.id);
    setError(null);
    setNotice(null);

    const response = await fetch(`/api/admin/support/posts/${encodeURIComponent(selectedPost.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(postEditor),
    });
    const data = (await response.json().catch(() => ({}))) as SavePostResponse;

    if (!response.ok || !data.post) {
      setError(data.error || "게시글 관리 정보 저장에 실패했습니다.");
      setBusyId(null);
      return;
    }

    setPosts((current) => current.map((post) => (post.id === data.post!.id ? data.post! : post)));
    setPostEditor({
      status: data.post.status,
      adminAnswer: data.post.admin_answer || "",
      hidden: data.post.is_hidden,
      hiddenReason: data.post.hidden_reason || "",
    });
    const notificationMessage = supportEmailNotificationMessage(data.emailNotification);
    if (notificationMessage?.tone === "warning") {
      setError(notificationMessage.text);
    } else {
      setNotice(notificationMessage?.text || "저장되었습니다.");
    }
    setBusyId(null);
  }

  async function saveFaq() {
    setBusyId(selectedFaqId || "new-faq");
    setError(null);

    const payload = {
      question: faqForm.question,
      answer: faqForm.answer,
      category: faqForm.category,
      sortOrder: Number(faqForm.sortOrder),
      isPublished: faqForm.isPublished,
    };
    const response = await fetch(
      selectedFaqId ? `/api/admin/support/faqs/${encodeURIComponent(selectedFaqId)}` : "/api/admin/support/faqs",
      {
        method: selectedFaqId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = (await response.json().catch(() => ({}))) as FaqsResponse;

    if (!response.ok || !data.faq) {
      setError(data.error || "FAQ 저장에 실패했습니다.");
      setBusyId(null);
      return;
    }

    await loadFaqs();
    setSelectedFaqId(data.faq.id);
    setFaqForm({
      question: data.faq.question,
      answer: data.faq.answer,
      category: data.faq.category,
      sortOrder: String(data.faq.sort_order),
      isPublished: data.faq.is_published,
    });
    setBusyId(null);
  }

  async function deleteFaq() {
    if (!selectedFaqId) return;
    if (!window.confirm("FAQ를 삭제하시겠습니까?")) return;

    setBusyId(selectedFaqId);
    setError(null);
    const response = await fetch(`/api/admin/support/faqs/${encodeURIComponent(selectedFaqId)}`, { method: "DELETE" });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(data.error || "FAQ 삭제에 실패했습니다.");
      setBusyId(null);
      return;
    }

    setSelectedFaqId(null);
    setFaqForm(emptyFaqForm());
    await loadFaqs();
    setBusyId(null);
  }

  return (
    <div className="grid gap-4 pb-10">
      <header className="rounded-2xl border border-stone-200 bg-white p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Admin Support</p>
        <h1 className="mt-2 text-2xl font-black text-stone-950">고객지원센터 관리</h1>
        <p className="mt-2 text-sm text-stone-600">게시글 {postTotal}건 / FAQ {faqs.length}건</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" className="h-9 rounded-lg px-3 text-xs" variant={mode === "posts" ? "primary" : "secondary"} onClick={() => setMode("posts")}>
            게시글
          </Button>
          <Button type="button" className="h-9 rounded-lg px-3 text-xs" variant={mode === "faqs" ? "primary" : "secondary"} onClick={() => setMode("faqs")}>
            FAQ
          </Button>
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</div>
      ) : null}

      {mode === "posts" ? (
        <>
          <section className="grid gap-3 rounded-2xl border border-stone-200 bg-white p-4 md:grid-cols-[1fr_150px_150px_150px]">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목 / 내용 / 작성자 검색" className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-900" />
            <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as "all" | SupportPostKind)} className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-900">
              <option value="all">전체 게시판</option>
              {SUPPORT_POST_KINDS.map((kind) => (
                <option key={kind} value={kind}>{SUPPORT_POST_KIND_LABELS[kind]}</option>
              ))}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | SupportPostStatus)} className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-900">
              <option value="all">전체 상태</option>
              {SUPPORT_POST_STATUSES.map((status) => (
                <option key={status} value={status}>{SUPPORT_POST_STATUS_LABELS[status]}</option>
              ))}
            </select>
            <select value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value as typeof visibilityFilter)} className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-900">
              {visibilityOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </section>

          <section className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
            <div className="grid gap-2">
              {isLoading ? <p className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-500">불러오는 중...</p> : null}
              {!isLoading && posts.length === 0 ? <p className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-500">게시글이 없습니다.</p> : null}
              {posts.map((post) => (
                <button key={post.id} type="button" onClick={() => selectPost(post)} className={`rounded-2xl border bg-white p-4 text-left transition ${selectedPost?.id === post.id ? "border-stone-950" : "border-stone-200 hover:border-stone-400"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-stone-950">{post.title}</p>
                      <p className="mt-1 text-xs text-stone-500">{SUPPORT_POST_KIND_LABELS[post.kind]} / {SUPPORT_POST_STATUS_LABELS[post.status]}</p>
                    </div>
                    <span className="rounded-full border border-stone-200 px-2 py-1 text-[11px] font-bold text-stone-500">{post.is_hidden ? "숨김" : post.deleted_at ? "삭제" : "공개"}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-stone-600">{post.body}</p>
                  <p className="mt-2 text-xs text-stone-400">{post.author_display_name} · {formatDate(post.created_at)}</p>
                </button>
              ))}
            </div>

            <article className="min-h-[520px] rounded-2xl border border-stone-200 bg-white p-5">
              {selectedPost ? (
                <div className="grid gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">{SUPPORT_POST_KIND_LABELS[selectedPost.kind]}</p>
                    <h2 className="mt-2 text-2xl font-black text-stone-950">{selectedPost.title}</h2>
                    <p className="mt-2 text-sm text-stone-600">{selectedPost.author_display_name} / {formatDate(selectedPost.created_at)}</p>
                  </div>
                  <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap rounded-xl border border-stone-100 bg-stone-50 p-4 text-sm leading-6 text-stone-800">{selectedPost.body}</pre>
                  <div className="grid gap-3 md:grid-cols-[180px_1fr]">
                    <select value={postEditor.status} onChange={(event) => setPostEditor((current) => ({ ...current, status: event.target.value as SupportPostStatus }))} className="h-10 rounded-lg border border-stone-300 px-3 text-sm outline-none focus:border-stone-900">
                      {SUPPORT_POST_STATUSES.map((status) => (
                        <option key={status} value={status}>{SUPPORT_POST_STATUS_LABELS[status]}</option>
                      ))}
                    </select>
                    <label className="flex h-10 items-center gap-2 rounded-lg border border-stone-200 px-3 text-sm font-semibold text-stone-700">
                      <input type="checkbox" checked={postEditor.hidden} onChange={(event) => setPostEditor((current) => ({ ...current, hidden: event.target.checked }))} />
                      공개 숨김
                    </label>
                  </div>
                  {postEditor.hidden ? (
                    <input value={postEditor.hiddenReason} onChange={(event) => setPostEditor((current) => ({ ...current, hiddenReason: event.target.value }))} placeholder="숨김 사유" className="h-10 rounded-lg border border-stone-300 px-3 text-sm outline-none focus:border-stone-900" />
                  ) : null}
                  <textarea value={postEditor.adminAnswer} onChange={(event) => setPostEditor((current) => ({ ...current, adminAnswer: event.target.value }))} rows={8} placeholder="관리자 공식 답변" className="rounded-lg border border-stone-300 px-3 py-2 text-sm leading-6 outline-none focus:border-stone-900" />
                  <Button type="button" className="h-10 rounded-lg px-3 text-xs" disabled={busyId === selectedPost.id} onClick={() => void saveSelectedPost()}>
                    저장
                  </Button>
                </div>
              ) : (
                <p className="py-12 text-center text-sm text-stone-500">게시글을 선택하세요.</p>
              )}
            </article>
          </section>
        </>
      ) : (
        <section className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="grid gap-2">
            <button type="button" onClick={() => { setSelectedFaqId(null); setFaqForm(emptyFaqForm()); }} className="rounded-2xl border border-dashed border-stone-300 bg-white p-4 text-left text-sm font-black text-stone-700">
              새 FAQ 작성
            </button>
            {faqs.map((faq) => (
              <button key={faq.id} type="button" onClick={() => selectFaq(faq)} className={`rounded-2xl border bg-white p-4 text-left transition ${selectedFaqId === faq.id ? "border-stone-950" : "border-stone-200 hover:border-stone-400"}`}>
                <p className="text-sm font-black text-stone-950">{faq.question}</p>
                <p className="mt-2 text-xs text-stone-500">{faq.category} / 정렬 {faq.sort_order} / {faq.is_published ? "공개" : "비공개"}</p>
              </button>
            ))}
          </div>
          <article className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="grid gap-3">
              <h2 className="text-xl font-black text-stone-950">{selectedFaqId ? "FAQ 수정" : "FAQ 생성"}</h2>
              <input value={faqForm.question} onChange={(event) => setFaqForm((current) => ({ ...current, question: event.target.value }))} placeholder="질문" className="h-10 rounded-lg border border-stone-300 px-3 text-sm outline-none focus:border-stone-900" />
              <textarea value={faqForm.answer} onChange={(event) => setFaqForm((current) => ({ ...current, answer: event.target.value }))} rows={8} placeholder="답변" className="rounded-lg border border-stone-300 px-3 py-2 text-sm leading-6 outline-none focus:border-stone-900" />
              <div className="grid gap-3 md:grid-cols-[1fr_120px_140px]">
                <input value={faqForm.category} onChange={(event) => setFaqForm((current) => ({ ...current, category: event.target.value }))} placeholder="카테고리" className="h-10 rounded-lg border border-stone-300 px-3 text-sm outline-none focus:border-stone-900" />
                <input value={faqForm.sortOrder} onChange={(event) => setFaqForm((current) => ({ ...current, sortOrder: event.target.value }))} placeholder="정렬" inputMode="numeric" className="h-10 rounded-lg border border-stone-300 px-3 text-sm outline-none focus:border-stone-900" />
                <label className="flex h-10 items-center gap-2 rounded-lg border border-stone-200 px-3 text-sm font-semibold text-stone-700">
                  <input type="checkbox" checked={faqForm.isPublished} onChange={(event) => setFaqForm((current) => ({ ...current, isPublished: event.target.checked }))} />
                  공개
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="h-10 rounded-lg px-3 text-xs" disabled={Boolean(busyId)} onClick={() => void saveFaq()}>
                  저장
                </Button>
                {selectedFaqId ? (
                  <Button type="button" variant="ghost" className="h-10 rounded-lg px-3 text-xs" disabled={Boolean(busyId)} onClick={() => void deleteFaq()}>
                    삭제
                  </Button>
                ) : null}
              </div>
            </div>
          </article>
        </section>
      )}
    </div>
  );
}
