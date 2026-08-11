"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ConsultationPatch, ConsultationSnapshot } from "../lib/consulting/contracts";
import { consultationStageHref } from "../lib/consulting/routes";

interface MutationResponse { snapshot?: ConsultationSnapshot; error?: string }
interface MutationOptions { navigate?: boolean }
interface RefreshOptions { silent?: boolean }

export function useConsultationMutation(initialSnapshot: ConsultationSnapshot) {
  const router = useRouter();
  const pathname = usePathname();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const mutate = useCallback(async (patch: Omit<ConsultationPatch, "expectedVersion">, options: MutationOptions = {}) => {
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
      const target = consultationStageHref(data.snapshot.sessionId, data.snapshot.journey.recommendedStage);
      if (options.navigate !== false && target !== pathname) router.push(target);
      return { ok: true as const, snapshot: data.snapshot };
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "상담을 저장하지 못했습니다.");
      return { ok: false as const, conflict: false as const, snapshot };
    } finally {
      setIsSaving(false);
    }
  }, [pathname, router, snapshot]);

  const refresh = useCallback(async (options: RefreshOptions = {}) => {
    try {
      const response = await fetch(`/api/consultations/${encodeURIComponent(snapshot.sessionId)}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as MutationResponse;
      if (response.ok && data.snapshot) {
        setSnapshot(data.snapshot);
        if (!options.silent) setNotice("서버의 최신 상담 상태를 불러왔습니다.");
        return { ok: true as const, snapshot: data.snapshot };
      }
      const message = data.error || "상담을 새로고침하지 못했습니다.";
      setNotice(message);
      return { ok: false as const, error: message };
    } catch (error) {
      const message = error instanceof Error ? error.message : "네트워크 연결을 확인하고 있습니다.";
      setNotice(message);
      return { ok: false as const, error: message };
    }
  }, [snapshot.sessionId]);

  return { snapshot, isSaving, notice, setNotice, mutate, refresh };
}
