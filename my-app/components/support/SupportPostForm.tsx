"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "../ui/Button";
import {
  SUPPORT_POST_KIND_DESCRIPTIONS,
  SUPPORT_POST_KIND_LABELS,
  SUPPORT_POST_KINDS,
  normalizeSupportPostKind,
  type SupportPostKind,
} from "../../lib/support-types";

interface SupportPostFormProps {
  initialKind?: string | null;
}

interface CreatePostResponse {
  post?: {
    id: string;
  };
  error?: string;
}

export function SupportPostForm({ initialKind }: SupportPostFormProps) {
  const router = useRouter();
  const [kind, setKind] = useState<SupportPostKind>(normalizeSupportPostKind(initialKind));
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    const response = await fetch("/api/support/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, title, body }),
    });
    const data = (await response.json().catch(() => ({}))) as CreatePostResponse;

    if (!response.ok || !data.post?.id) {
      setError(data.error || "게시글 등록에 실패했습니다.");
      setIsSubmitting(false);
      return;
    }

    router.push(`/support/posts/${encodeURIComponent(data.post.id)}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="app-panel grid gap-4 p-5 sm:p-6">
      <div className="grid gap-2">
        <label className="text-sm font-black text-[var(--app-text)]" htmlFor="support-kind">
          게시판
        </label>
        <select
          id="support-kind"
          value={kind}
          onChange={(event) => setKind(normalizeSupportPostKind(event.target.value))}
          className="app-input h-11 px-3 text-sm"
        >
          {SUPPORT_POST_KINDS.map((item) => (
            <option key={item} value={item}>
              {SUPPORT_POST_KIND_LABELS[item]}
            </option>
          ))}
        </select>
        <p className="text-xs leading-5 text-[var(--app-muted)]">{SUPPORT_POST_KIND_DESCRIPTIONS[kind]}</p>
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-black text-[var(--app-text)]" htmlFor="support-title">
          제목
        </label>
        <input
          id="support-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          minLength={4}
          maxLength={120}
          required
          placeholder="공개 목록에 표시될 제목"
          className="app-input h-11 px-3 text-sm"
        />
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-black text-[var(--app-text)]" htmlFor="support-body">
          내용
        </label>
        <textarea
          id="support-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          minLength={10}
          maxLength={5000}
          required
          rows={10}
          placeholder="상황, 기대한 결과, 실제 결과를 가능한 구체적으로 적어주세요."
          className="app-input px-3 py-3 text-sm leading-6"
        />
      </div>

      {error ? (
        <p className="rounded-[var(--app-radius-control)] border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="h-11 gap-2" disabled={isSubmitting}>
        <Send className="h-4 w-4" aria-hidden="true" />
        {isSubmitting ? "등록 중" : "게시글 등록"}
      </Button>
    </form>
  );
}
