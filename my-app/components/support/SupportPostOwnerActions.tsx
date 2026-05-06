"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Save, Trash2, X } from "lucide-react";
import { Button } from "../ui/Button";

interface SupportPostOwnerActionsProps {
  postId: string;
  title: string;
  body: string;
}

interface UpdatePostResponse {
  error?: string;
}

export function SupportPostOwnerActions({ body, postId, title }: SupportPostOwnerActionsProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [nextTitle, setNextTitle] = useState(title);
  const [nextBody, setNextBody] = useState(body);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function savePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy) return;

    setIsBusy(true);
    setError(null);

    const response = await fetch(`/api/support/posts/${encodeURIComponent(postId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: nextTitle, body: nextBody }),
    });
    const data = (await response.json().catch(() => ({}))) as UpdatePostResponse;

    if (!response.ok) {
      setError(data.error || "게시글 수정에 실패했습니다.");
      setIsBusy(false);
      return;
    }

    setIsEditing(false);
    setIsBusy(false);
    router.refresh();
  }

  async function deletePost() {
    if (isBusy) return;
    if (!window.confirm("게시글을 삭제하시겠습니까? 공개 목록에서 사라집니다.")) {
      return;
    }

    setIsBusy(true);
    setError(null);

    const response = await fetch(`/api/support/posts/${encodeURIComponent(postId)}`, {
      method: "DELETE",
    });
    const data = (await response.json().catch(() => ({}))) as UpdatePostResponse;

    if (!response.ok) {
      setError(data.error || "게시글 삭제에 실패했습니다.");
      setIsBusy(false);
      return;
    }

    router.push("/support?tab=all");
    router.refresh();
  }

  if (!isEditing) {
    return (
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" className="h-9 gap-2 px-3 text-xs" onClick={() => setIsEditing(true)}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
          수정
        </Button>
        <Button type="button" variant="ghost" className="h-9 gap-2 px-3 text-xs" disabled={isBusy} onClick={deletePost}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          삭제
        </Button>
        {error ? <p className="text-sm font-semibold text-rose-700">{error}</p> : null}
      </div>
    );
  }

  return (
    <form onSubmit={savePost} className="mt-5 grid gap-3 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-4">
      <input
        value={nextTitle}
        onChange={(event) => setNextTitle(event.target.value)}
        minLength={4}
        maxLength={120}
        required
        className="app-input h-10 px-3 text-sm"
      />
      <textarea
        value={nextBody}
        onChange={(event) => setNextBody(event.target.value)}
        minLength={10}
        maxLength={5000}
        required
        rows={8}
        className="app-input px-3 py-2 text-sm leading-6"
      />
      {error ? <p className="text-sm font-semibold text-rose-700">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="h-9 gap-2 px-3 text-xs" disabled={isBusy}>
          <Save className="h-4 w-4" aria-hidden="true" />
          저장
        </Button>
        <Button type="button" variant="secondary" className="h-9 gap-2 px-3 text-xs" disabled={isBusy} onClick={() => setIsEditing(false)}>
          <X className="h-4 w-4" aria-hidden="true" />
          취소
        </Button>
      </div>
    </form>
  );
}
