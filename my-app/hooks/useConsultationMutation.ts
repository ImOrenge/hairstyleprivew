"use client";

import { useCallback, useState } from "react";
import type { ConsultationPatch, ConsultationSnapshot } from "../lib/consulting/contracts";

interface MutationResponse { snapshot?: ConsultationSnapshot; error?: string }

export function useConsultationMutation(initialSnapshot: ConsultationSnapshot) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const mutate = useCallback(async (patch: Omit<ConsultationPatch, "expectedVersion">) => {
    setIsSaving(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/consultations/${encodeURIComponent(snapshot.sessionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "If-Match": String(snapshot.version) },
        body: JSON.stringify({ ...patch, expectedVersion: snapshot.version }),
      });
      const data = (await response.json().catch(() => ({}))) as MutationResponse;
      if (response.status === 409 && data.snapshot) {
        setSnapshot(data.snapshot);
        setNotice("다른 화면의 최신 변경을 불러왔습니다. 내용을 확인한 뒤 다시 저장해 주세요.");
        return { ok: false as const, conflict: true as const, snapshot: data.snapshot };
      }
      if (!response.ok || !data.snapshot) throw new Error(data.error || "상담을 저장하지 못했습니다.");
      setSnapshot(data.snapshot);
      return { ok: true as const, snapshot: data.snapshot };
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "상담을 저장하지 못했습니다.");
      return { ok: false as const, conflict: false as const, snapshot };
    } finally {
      setIsSaving(false);
    }
  }, [snapshot]);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/consultations/${encodeURIComponent(snapshot.sessionId)}`, { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as MutationResponse;
    if (response.ok && data.snapshot) {
      setSnapshot(data.snapshot);
      setNotice("서버의 최신 상담 상태를 불러왔습니다.");
    } else {
      setNotice(data.error || "상담을 새로고침하지 못했습니다.");
    }
  }, [snapshot.sessionId]);

  return { snapshot, isSaving, notice, setNotice, mutate, refresh };
}
