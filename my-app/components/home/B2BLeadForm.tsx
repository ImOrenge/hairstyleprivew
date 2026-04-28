"use client";

import { useState } from "react";
import { Button } from "../ui/Button";

interface LeadFormState {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  message: string;
}

const initialForm: LeadFormState = {
  companyName: "",
  contactName: "",
  email: "",
  phone: "",
  message: "",
};

export function B2BLeadForm() {
  const [form, setForm] = useState<LeadFormState>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    const response = await fetch("/api/b2b/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(data.error || "제휴 문의 접수에 실패했습니다.");
      setIsSubmitting(false);
      return;
    }

    setForm(initialForm);
    setSuccess("제휴 문의가 접수되었습니다. 확인 후 연락드리겠습니다.");
    setIsSubmitting(false);
  }

  return (
    <div className="rounded-2xl border border-amber-200/80 bg-white/75 p-4 shadow-sm dark:border-amber-300/20 dark:bg-black/20">
      <p className="text-sm font-black text-amber-950 dark:text-amber-100">B2B 제휴 문의</p>
      <div className="mt-3 grid gap-2">
        <input
          value={form.companyName}
          onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))}
          placeholder="회사명"
          className="h-10 rounded-lg border border-amber-200 bg-white px-3 text-sm text-stone-900 outline-none focus:border-amber-500"
        />
        <input
          value={form.contactName}
          onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))}
          placeholder="담당자명"
          className="h-10 rounded-lg border border-amber-200 bg-white px-3 text-sm text-stone-900 outline-none focus:border-amber-500"
        />
        <input
          value={form.email}
          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
          placeholder="이메일"
          className="h-10 rounded-lg border border-amber-200 bg-white px-3 text-sm text-stone-900 outline-none focus:border-amber-500"
        />
        <input
          value={form.phone}
          onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
          placeholder="연락처 (선택)"
          className="h-10 rounded-lg border border-amber-200 bg-white px-3 text-sm text-stone-900 outline-none focus:border-amber-500"
        />
        <textarea
          value={form.message}
          onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
          rows={4}
          placeholder="요청 내용"
          className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-amber-500"
        />
        <Button type="button" className="h-10 rounded-lg px-4 text-sm" onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? "접수 중..." : "문의 보내기"}
        </Button>
      </div>
      {error ? <p className="mt-2 text-xs font-semibold text-rose-700">{error}</p> : null}
      {success ? <p className="mt-2 text-xs font-semibold text-emerald-700">{success}</p> : null}
    </div>
  );
}

