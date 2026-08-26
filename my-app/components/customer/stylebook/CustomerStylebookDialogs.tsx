/* eslint-disable @next/next/no-img-element */
"use client";

import type {
  CustomerStylebookCollectionColorV2,
  CustomerStylebookCollectionMutationV2,
  CustomerStylebookEntryV2,
  CustomerStylebookItemStatePatchV2,
  CustomerStylebookShareRequestV2,
  CustomerStylebookV2,
  CustomerStylebookWearLogRequestV2,
} from "@hairfit/shared";
import { customerStylebookDisplayTitleV2 } from "@hairfit/shared";
import { Archive, BookOpenCheck, Copy, FileDown, FolderPlus, Heart, Plus, Share2, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Dialog } from "../../ui/Dialog";
import { stylebookResultHref } from "./CustomerStylebookCard";

export interface CustomerStylebookActions {
  saveItemState: (patch: CustomerStylebookItemStatePatchV2) => Promise<void>;
  mutateCollection: (mutation: CustomerStylebookCollectionMutationV2) => Promise<void>;
  createWearLog: (value: CustomerStylebookWearLogRequestV2, file: File | null, consent: boolean) => Promise<void>;
  deleteWearLog: (id: string) => Promise<void>;
  createShare: (value: CustomerStylebookShareRequestV2) => Promise<{ url: string; expiresAt: string }>;
  revokeShare: (id: string) => Promise<void>;
  startReferencedConsultation: (entry: CustomerStylebookEntryV2) => Promise<void>;
}

function itemRef(entry: CustomerStylebookEntryV2) {
  return { kind: entry.kind, id: entry.id, consultationId: entry.consultationId };
}

function RatingSelect({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="customer-stylebook-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}점</option>)}
      </select>
    </label>
  );
}

export function CustomerStylebookManageDialog({
  entry,
  collection,
  open,
  busy,
  onOpenChange,
  onOpenWearLog,
  onOpenShare,
  actions,
}: {
  entry: CustomerStylebookEntryV2;
  collection: CustomerStylebookV2;
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenWearLog: () => void;
  onOpenShare: () => void;
  actions: CustomerStylebookActions;
}) {
  const [customTitle, setCustomTitle] = useState(entry.state.customTitle ?? "");
  const [note, setNote] = useState(entry.state.note);
  const [tags, setTags] = useState(entry.state.tags.join(", "));
  const title = customerStylebookDisplayTitleV2(entry);
  const logs = collection.wearLogs.filter((log) => log.item.kind === entry.kind && log.item.id === entry.id);
  const shares = collection.activeShares.filter((share) => share.item.kind === entry.kind && share.item.id === entry.id);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    await actions.saveItemState({
      kind: entry.kind,
      itemId: entry.id,
      customTitle: customTitle || null,
      note,
      tags: tags.split(",").map((value) => value.trim()).filter(Boolean),
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description="원본 컨설팅 결과는 유지하고 나만의 분류와 기록만 추가합니다." size="lg">
      <div className="customer-stylebook-dialog-grid">
        <form className="customer-stylebook-form" onSubmit={(event) => void save(event)}>
          <label className="customer-stylebook-field"><span>나만의 스타일 이름</span><input value={customTitle} maxLength={80} placeholder={entry.title} onChange={(event) => setCustomTitle(event.target.value)} /></label>
          <label className="customer-stylebook-field"><span>개인 메모</span><textarea value={note} maxLength={2000} rows={5} placeholder="다음 시술이나 착용 때 기억할 내용을 적어두세요." onChange={(event) => setNote(event.target.value)} /></label>
          <label className="customer-stylebook-field"><span>태그</span><input value={tags} placeholder="미용실 상담, 가을, 관리 쉬움" onChange={(event) => setTags(event.target.value)} /><small>쉼표로 구분해 최대 20개까지 저장합니다.</small></label>
          <button type="submit" className="customer-primary-button" disabled={busy}>변경 저장</button>
        </form>

        <section className="customer-stylebook-dialog-section">
          <h3>빠른 설정</h3>
          <div className="customer-stylebook-inline-actions">
            <button type="button" aria-pressed={entry.state.favorite} onClick={() => void actions.saveItemState({ kind: entry.kind, itemId: entry.id, favorite: !entry.state.favorite })}>
              <Heart aria-hidden="true" fill={entry.state.favorite ? "currentColor" : "none"} /> {entry.state.favorite ? "즐겨찾기 해제" : "즐겨찾기"}
            </button>
            <button type="button" onClick={() => void actions.saveItemState({ kind: entry.kind, itemId: entry.id, archived: !entry.state.archivedAt })}>
              <Archive aria-hidden="true" /> {entry.state.archivedAt ? "보관 해제" : "보관하기"}
            </button>
          </div>
        </section>

        <section className="customer-stylebook-dialog-section">
          <h3>컬렉션</h3>
          {collection.collections.length ? collection.collections.map((value) => {
            const included = value.itemRefs.some((ref) => ref.kind === entry.kind && ref.id === entry.id);
            return (
              <label key={value.id} className="customer-stylebook-check-row">
                <input type="checkbox" checked={included} onChange={(event) => void actions.mutateCollection({ action: "set_collection_item", collectionId: value.id, item: itemRef(entry), included: event.target.checked })} />
                <span>{value.name}</span>
              </label>
            );
          }) : <p>아직 만든 컬렉션이 없습니다.</p>}
        </section>

        <section className="customer-stylebook-dialog-section">
          <div className="customer-stylebook-section-title"><h3>실제 스타일 기록</h3><button type="button" onClick={onOpenWearLog}><Plus aria-hidden="true" /> 기록 추가</button></div>
          {logs.length ? logs.map((log) => (
            <article key={log.id} className="customer-stylebook-record-row">
              {log.photoUrl ? <img src={log.photoUrl} alt={`${title} 실제 적용`} /> : null}
              <div><strong>{log.appliedOn} · 만족도 {log.satisfaction}/5</strong><p>{log.note || log.reactionNote || "메모 없음"}</p></div>
              <button type="button" aria-label={`${log.appliedOn} 기록 삭제`} onClick={() => void actions.deleteWearLog(log.id)}><Trash2 aria-hidden="true" /></button>
            </article>
          )) : <p>실제로 적용한 뒤 만족도와 편의성을 기록해 보세요.</p>}
        </section>

        <section className="customer-stylebook-dialog-section">
          <div className="customer-stylebook-section-title"><h3>공유 링크</h3><button type="button" onClick={onOpenShare}><Share2 aria-hidden="true" /> 새 링크</button></div>
          {shares.length ? shares.map((share) => (
            <div key={share.id} className="customer-stylebook-share-row"><span>{new Date(share.expiresAt).toLocaleString("ko-KR")}까지</span><button type="button" onClick={() => void actions.revokeShare(share.id)}>링크 해제</button></div>
          )) : <p>활성 공유 링크가 없습니다.</p>}
        </section>

        <section className="customer-stylebook-dialog-section">
          <h3>결과 활용</h3>
          <div className="customer-stylebook-inline-actions">
            <Link href={stylebookResultHref(entry)}><BookOpenCheck aria-hidden="true" /> 컨설팅 결과 보기</Link>
            <Link href={`${stylebookResultHref(entry)}#report-toolbar`}><FileDown aria-hidden="true" /> PDF 저장 화면</Link>
            <button type="button" onClick={() => void actions.startReferencedConsultation(entry)}><Sparkles aria-hidden="true" /> 이 스타일 참고해 새 컨설팅</button>
          </div>
          <p className="customer-stylebook-flow-note">새 컨설팅은 첫 단계부터 시작하며 질문과 순서를 생략하지 않습니다.</p>
        </section>
      </div>
    </Dialog>
  );
}

export function CustomerStylebookWearLogDialog({ entry, open, busy, onOpenChange, actions }: { entry: CustomerStylebookEntryV2 | null; open: boolean; busy: boolean; onOpenChange: (open: boolean) => void; actions: CustomerStylebookActions }) {
  const [appliedOn, setAppliedOn] = useState(new Date().toISOString().slice(0, 10));
  const [satisfaction, setSatisfaction] = useState(4);
  const [convenience, setConvenience] = useState(4);
  const [reactionNote, setReactionNote] = useState("");
  const [note, setNote] = useState("");
  const [wouldRepeat, setWouldRepeat] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  if (!entry) return null;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await actions.createWearLog({
      item: itemRef(entry),
      appliedOn,
      applicationType: entry.kind === "hair" ? "hair_service" : "outfit_worn",
      satisfaction,
      convenience,
      reactionNote,
      note,
      wouldRepeat,
    }, file, consent);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="실제 스타일 기록" description="개인 기록으로만 저장되며 공유할 때도 별도로 포함 여부를 선택합니다." size="md">
      <form className="customer-stylebook-form" onSubmit={(event) => void submit(event)}>
        <label className="customer-stylebook-field"><span>적용 날짜</span><input type="date" required value={appliedOn} onChange={(event) => setAppliedOn(event.target.value)} /></label>
        <div className="customer-stylebook-rating-grid"><RatingSelect label="만족도" value={satisfaction} onChange={setSatisfaction} /><RatingSelect label="편의성" value={convenience} onChange={setConvenience} /></div>
        <label className="customer-stylebook-field"><span>주변 반응</span><input value={reactionNote} maxLength={500} onChange={(event) => setReactionNote(event.target.value)} /></label>
        <label className="customer-stylebook-field"><span>개인 메모</span><textarea value={note} maxLength={2000} rows={4} onChange={(event) => setNote(event.target.value)} /></label>
        <label className="customer-stylebook-check-row"><input type="checkbox" checked={wouldRepeat} onChange={(event) => setWouldRepeat(event.target.checked)} /><span>다시 적용하고 싶어요</span></label>
        <label className="customer-stylebook-field"><span>실제 사진 (선택)</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
        {file ? <label className="customer-stylebook-check-row"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>이 사진을 비공개 스타일 기록에 저장하는 데 동의합니다.</span></label> : null}
        <button type="submit" className="customer-primary-button" disabled={busy || Boolean(file && !consent)}>기록 저장</button>
      </form>
    </Dialog>
  );
}

export function CustomerStylebookShareDialog({ entry, collection, open, busy, onOpenChange, actions }: { entry: CustomerStylebookEntryV2 | null; collection: CustomerStylebookV2; open: boolean; busy: boolean; onOpenChange: (open: boolean) => void; actions: CustomerStylebookActions }) {
  const [hours, setHours] = useState<24 | 168 | 720>(168);
  const [includePrivateNote, setIncludePrivateNote] = useState(false);
  const [includeActualPhoto, setIncludeActualPhoto] = useState(false);
  const [createdUrl, setCreatedUrl] = useState("");
  if (!entry) return null;
  const hasPhoto = collection.wearLogs.some((log) => log.item.kind === entry.kind && log.item.id === entry.id && log.photoUrl);
  const create = async () => {
    const result = await actions.createShare({ item: itemRef(entry), hours, includePrivateNote, includeActualPhoto: includeActualPhoto && hasPhoto });
    setCreatedUrl(result.url);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="안전하게 공유하기" description="원본 얼굴 사진은 포함하지 않으며 링크는 만료되거나 즉시 해제할 수 있습니다." size="md">
      <div className="customer-stylebook-form">
        <label className="customer-stylebook-field"><span>링크 유효 기간</span><select value={hours} onChange={(event) => setHours(Number(event.target.value) as 24 | 168 | 720)}><option value={24}>24시간</option><option value={168}>7일</option><option value={720}>30일</option></select></label>
        <label className="customer-stylebook-check-row"><input type="checkbox" checked={includePrivateNote} onChange={(event) => setIncludePrivateNote(event.target.checked)} /><span>내 개인 메모 포함</span></label>
        <label className="customer-stylebook-check-row"><input type="checkbox" disabled={!hasPhoto} checked={includeActualPhoto && hasPhoto} onChange={(event) => setIncludeActualPhoto(event.target.checked)} /><span>실제 적용 사진 포함 {hasPhoto ? "" : "(저장된 사진 없음)"}</span></label>
        <button type="button" className="customer-primary-button" disabled={busy} onClick={() => void create()}>공유 링크 만들기</button>
        {createdUrl ? <div className="customer-stylebook-created-share"><p>{createdUrl}</p><button type="button" onClick={() => void navigator.clipboard.writeText(createdUrl)}><Copy aria-hidden="true" /> 복사</button></div> : null}
      </div>
    </Dialog>
  );
}

export function CustomerStylebookCollectionDialog({ collection, open, busy, onOpenChange, actions }: { collection: CustomerStylebookV2; open: boolean; busy: boolean; onOpenChange: (open: boolean) => void; actions: CustomerStylebookActions }) {
  const [name, setName] = useState("");
  const [colorKey, setColorKey] = useState<CustomerStylebookCollectionColorV2>("champagne");
  const [renameId, setRenameId] = useState("");
  const [rename, setRename] = useState("");
  const create = async (event: FormEvent) => {
    event.preventDefault();
    await actions.mutateCollection({ action: "create_collection", name, colorKey });
    setName("");
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="컬렉션 관리" description="상황·계절·시술 계획에 맞춰 헤어와 패션 결과를 함께 묶을 수 있습니다." size="md">
      <form className="customer-stylebook-form customer-stylebook-collection-create" onSubmit={(event) => void create(event)}>
        <label className="customer-stylebook-field"><span>새 컬렉션 이름</span><input required maxLength={60} value={name} placeholder="예: 9월 하객룩" onChange={(event) => setName(event.target.value)} /></label>
        <label className="customer-stylebook-field"><span>표시 색상</span><select value={colorKey} onChange={(event) => setColorKey(event.target.value as CustomerStylebookCollectionColorV2)}><option value="champagne">샴페인</option><option value="ivory">아이보리</option><option value="graphite">그래파이트</option><option value="rose">로즈</option><option value="sage">세이지</option></select></label>
        <button type="submit" className="customer-primary-button" disabled={busy}><FolderPlus aria-hidden="true" /> 컬렉션 만들기</button>
      </form>
      <div className="customer-stylebook-collection-list">
        {collection.collections.map((value) => (
          <div key={value.id} data-color={value.colorKey}>
            {renameId === value.id ? (
              <label className="customer-stylebook-field"><span className="sr-only">{value.name} 새 이름</span><input value={rename} maxLength={60} onChange={(event) => setRename(event.target.value)} /></label>
            ) : <span><strong>{value.name}</strong><small>{value.itemRefs.length}개 스타일</small></span>}
            <span className="customer-stylebook-inline-actions">
              {renameId === value.id ? (
                <button type="button" disabled={busy || !rename.trim()} onClick={() => void actions.mutateCollection({ action: "update_collection", collectionId: value.id, name: rename.trim(), colorKey: value.colorKey }).then(() => setRenameId(""))}>저장</button>
              ) : (
                <button type="button" onClick={() => { setRenameId(value.id); setRename(value.name); }}>이름 변경</button>
              )}
              <button type="button" aria-label={`${value.name} 삭제`} onClick={() => void actions.mutateCollection({ action: "delete_collection", collectionId: value.id })}><Trash2 aria-hidden="true" /></button>
            </span>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

export function CustomerStylebookCompareDialog({ entries, open, onOpenChange }: { entries: CustomerStylebookEntryV2[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  const hair = entries[0]?.kind === "hair";
  const rows = hair ? [
    ["길이", (entry: CustomerStylebookEntryV2) => entry.kind === "hair" ? entry.length : ""],
    ["앞머리", (entry: CustomerStylebookEntryV2) => entry.kind === "hair" ? entry.bang : ""],
    ["질감", (entry: CustomerStylebookEntryV2) => entry.kind === "hair" ? entry.texture : ""],
    ["볼륨", (entry: CustomerStylebookEntryV2) => entry.kind === "hair" ? entry.volume.join(", ") : ""],
    ["관리 난이도", (entry: CustomerStylebookEntryV2) => entry.kind === "hair" ? entry.maintenanceLevel : ""],
    ["추천 이유", (entry: CustomerStylebookEntryV2) => entry.kind === "hair" ? entry.description : ""],
  ] as const : [
    ["장르", (entry: CustomerStylebookEntryV2) => entry.kind === "fashion" ? entry.genre : ""],
    ["실루엣", (entry: CustomerStylebookEntryV2) => entry.kind === "fashion" ? entry.silhouette : ""],
    ["넥라인", (entry: CustomerStylebookEntryV2) => entry.kind === "fashion" ? entry.neckline : ""],
    ["아이템", (entry: CustomerStylebookEntryV2) => entry.kind === "fashion" ? entry.items.map((item) => item.name).join(", ") : ""],
    ["쇼핑 키워드", (entry: CustomerStylebookEntryV2) => entry.kind === "fashion" ? entry.shoppingKeywords.join(", ") : ""],
  ] as const;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`${hair ? "헤어" : "패션"} 결과 비교`} description="확정된 결과의 차이를 나란히 확인합니다." size="xl">
      <div className="customer-stylebook-compare-table" role="region" aria-label="스타일 비교표" tabIndex={0}>
        <table><thead><tr><th>비교 항목</th>{entries.map((entry) => <th key={entry.id}>{customerStylebookDisplayTitleV2(entry)}</th>)}</tr></thead><tbody><tr><th>미리보기</th>{entries.map((entry) => <td key={entry.id}>{entry.imageUrl ? <img src={entry.imageUrl} alt="" /> : "이미지 없음"}</td>)}</tr>{rows.map(([label, value]) => <tr key={label}><th>{label}</th>{entries.map((entry) => <td key={entry.id}>{value(entry) || "확인 필요"}</td>)}</tr>)}</tbody></table>
      </div>
    </Dialog>
  );
}
