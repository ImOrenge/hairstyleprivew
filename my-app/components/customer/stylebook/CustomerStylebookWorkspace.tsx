"use client";

import type {
  CustomerStylebookEntryV2,
  CustomerStylebookV2,
  CustomerStylebookViewV2,
} from "@hairfit/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CustomerStylebookCollection } from "../CustomerStylebookCollection";
import type { CustomerStylebookActions } from "./CustomerStylebookDialogs";

function itemKey(kind: string, id: string) {
  return `${kind}:${id}`;
}

export function CustomerStylebookWorkspace({
  initialCollection,
  activeView,
  routeBase,
  memoryPersistence = false,
}: {
  initialCollection: CustomerStylebookV2;
  activeView: CustomerStylebookViewV2;
  routeBase?: string;
  memoryPersistence?: boolean;
}) {
  const router = useRouter();
  const [collection, setCollection] = useState(initialCollection);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const request = async <T,>(input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fetch(input, init);
    const data = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) throw new Error(data.error || "스타일북 변경을 저장하지 못했습니다.");
    return data;
  };

  const refresh = async () => {
    if (memoryPersistence) return;
    setCollection(await request<CustomerStylebookV2>("/api/mobile/stylebook", { cache: "no-store" }));
  };

  const perform = async (label: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(label);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "스타일북 변경을 저장하지 못했습니다.");
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const saveItemState: CustomerStylebookActions["saveItemState"] = async (patch) => {
    await perform("스타일북 설정을 저장했습니다.", async () => {
      if (memoryPersistence) {
        const now = new Date().toISOString();
        setCollection((current) => ({
          ...current,
          [patch.kind]: current[patch.kind].map((entry) => entry.id === patch.itemId ? {
            ...entry,
            state: {
              ...entry.state,
              ...(patch.customTitle !== undefined ? { customTitle: patch.customTitle?.trim() || null } : {}),
              ...(patch.note !== undefined ? { note: patch.note.trim() } : {}),
              ...(patch.tags !== undefined ? { tags: [...new Set(patch.tags.map((value) => value.trim()).filter(Boolean))] } : {}),
              ...(patch.favorite !== undefined ? { favorite: patch.favorite } : {}),
              ...(patch.archived !== undefined ? { archivedAt: patch.archived ? now : null } : {}),
              updatedAt: now,
            },
          } : entry),
        }));
        return;
      }
      await request("/api/mobile/stylebook", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      await refresh();
    });
  };

  const mutateCollection: CustomerStylebookActions["mutateCollection"] = async (mutation) => {
    await perform("컬렉션을 변경했습니다.", async () => {
      if (memoryPersistence) {
        setCollection((current) => {
          if (mutation.action === "create_collection") {
            const now = new Date().toISOString();
            return { ...current, collections: [...current.collections, { id: crypto.randomUUID(), name: mutation.name?.trim() || "새 컬렉션", colorKey: mutation.colorKey ?? "champagne", sortOrder: current.collections.length, itemRefs: [], createdAt: now, updatedAt: now }] };
          }
          if (mutation.action === "delete_collection") return { ...current, collections: current.collections.filter((value) => value.id !== mutation.collectionId) };
          if (mutation.action === "update_collection") return { ...current, collections: current.collections.map((value) => value.id === mutation.collectionId ? { ...value, name: mutation.name?.trim() || value.name, colorKey: mutation.colorKey ?? value.colorKey, updatedAt: new Date().toISOString() } : value) };
          if (mutation.action === "set_collection_item" && mutation.item) return { ...current, collections: current.collections.map((value) => value.id !== mutation.collectionId ? value : { ...value, itemRefs: mutation.included ? [...value.itemRefs.filter((ref) => itemKey(ref.kind, ref.id) !== itemKey(mutation.item!.kind, mutation.item!.id)), mutation.item!] : value.itemRefs.filter((ref) => itemKey(ref.kind, ref.id) !== itemKey(mutation.item!.kind, mutation.item!.id)) }) };
          return current;
        });
        return;
      }
      await request("/api/mobile/stylebook", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "collection", collection: mutation }) });
      await refresh();
    });
  };

  const createWearLog: CustomerStylebookActions["createWearLog"] = async (value, file, consent) => {
    await perform("실제 스타일 기록을 저장했습니다.", async () => {
      if (memoryPersistence) {
        const now = new Date().toISOString();
        setCollection((current) => ({ ...current, wearLogs: [{ id: crypto.randomUUID(), item: value.item, appliedOn: value.appliedOn, applicationType: value.applicationType, satisfaction: value.satisfaction, convenience: value.convenience, reactionNote: value.reactionNote, note: value.note, wouldRepeat: value.wouldRepeat, photoUrl: file && consent ? URL.createObjectURL(file) : null, photoConsentedAt: file && consent ? now : null, createdAt: now, updatedAt: now }, ...current.wearLogs] }));
        return;
      }
      const form = new FormData();
      form.append("value", JSON.stringify(value));
      if (file) form.append("file", file);
      form.append("photoConsent", String(consent));
      await request("/api/mobile/stylebook", { method: "POST", body: form });
      await refresh();
    });
  };

  const deleteWearLog: CustomerStylebookActions["deleteWearLog"] = async (id) => {
    await perform("실제 스타일 기록을 삭제했습니다.", async () => {
      if (memoryPersistence) { setCollection((current) => ({ ...current, wearLogs: current.wearLogs.filter((value) => value.id !== id) })); return; }
      await request("/api/mobile/stylebook", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "wear_log", id }) });
      await refresh();
    });
  };

  const createShare: CustomerStylebookActions["createShare"] = async (value) => {
    let result = { url: "", expiresAt: "" };
    await perform("공유 링크를 만들었습니다.", async () => {
      if (memoryPersistence) {
        const id = crypto.randomUUID();
        const token = `harness-${id.replaceAll("-", "")}-share-token`;
        const expiresAt = new Date(Date.now() + value.hours * 3600000).toISOString();
        setCollection((current) => ({ ...current, activeShares: [{ id, item: value.item, includePrivateNote: value.includePrivateNote, includeActualPhoto: value.includeActualPhoto, expiresAt, createdAt: new Date().toISOString() }, ...current.activeShares] }));
        result = { url: `${window.location.origin}/stylebook/share/${token}`, expiresAt };
        return;
      }
      const created = await request<{ token: string; expiresAt: string }>("/api/mobile/stylebook", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "share", share: value }) });
      result = { url: `${window.location.origin}/stylebook/share/${created.token}`, expiresAt: created.expiresAt };
      await refresh();
    });
    return result;
  };

  const revokeShare: CustomerStylebookActions["revokeShare"] = async (id) => {
    await perform("공유 링크를 해제했습니다.", async () => {
      if (memoryPersistence) { setCollection((current) => ({ ...current, activeShares: current.activeShares.filter((value) => value.id !== id) })); return; }
      await request("/api/mobile/stylebook", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "share", id }) });
      await refresh();
    });
  };

  const startReferencedConsultation: CustomerStylebookActions["startReferencedConsultation"] = async (entry: CustomerStylebookEntryV2) => {
    await perform("기존 흐름 그대로 새 컨설팅을 시작합니다.", async () => {
      if (memoryPersistence) return;
      const created = await request<{ snapshot: { sessionId: string } }>("/api/mobile/stylebook", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reference", item: { kind: entry.kind, id: entry.id, consultationId: entry.consultationId } }) });
      router.push(`/consulting/${encodeURIComponent(created.snapshot.sessionId)}/discovery`);
    });
  };

  const actions: CustomerStylebookActions = { saveItemState, mutateCollection, createWearLog, deleteWearLog, createShare, revokeShare, startReferencedConsultation };
  return <CustomerStylebookCollection collection={collection} activeView={activeView} actions={actions} busy={busy} message={message} routeBase={routeBase} />;
}
