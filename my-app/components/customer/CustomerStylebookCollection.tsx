/* eslint-disable @next/next/no-img-element */
"use client";

import type {
  CustomerStylebookEntryV2,
  CustomerStylebookSortV2,
  CustomerStylebookV2,
  CustomerStylebookViewV2,
} from "@hairfit/shared";
import {
  customerStylebookDisplayTitleV2,
  customerStylebookFacetValuesV2,
  filterCustomerStylebookEntriesV2,
} from "@hairfit/shared";
import { ArrowRight, CheckSquare2, FolderHeart, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CustomerStylebookCard } from "./stylebook/CustomerStylebookCard";
import {
  CustomerStylebookCollectionDialog,
  CustomerStylebookCompareDialog,
  CustomerStylebookManageDialog,
  CustomerStylebookShareDialog,
  CustomerStylebookWearLogDialog,
  type CustomerStylebookActions,
} from "./stylebook/CustomerStylebookDialogs";

interface CustomerStylebookCollectionProps {
  collection: CustomerStylebookV2;
  activeView: CustomerStylebookViewV2;
  actions: CustomerStylebookActions;
  busy?: boolean;
  message?: string;
  routeBase?: string;
}

const FACET_LABELS: Record<string, string> = {
  short: "숏", medium: "미디엄", long: "롱", none: "앞머리 없음",
  see_through: "시스루뱅", straight: "스트레이트", wavy: "웨이브", curly: "컬",
  low: "관리 쉬움", medium_maintenance: "관리 보통", high: "관리 높음",
  DAILY: "데일리", WORK: "출근", STATEMENT: "포인트", minimal: "미니멀",
  classic: "클래식", street: "스트리트",
};

function humanFacet(value: string) {
  return FACET_LABELS[value] ?? value.replaceAll("_", " ");
}

function safePaletteColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#A8863A";
}

async function downloadStyleImage(entry: CustomerStylebookEntryV2) {
  if (!entry.imageUrl) return;
  const response = await fetch(entry.imageUrl);
  if (!response.ok) throw new Error("이미지를 내려받지 못했습니다.");
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `HairFit-${entry.kind}-${entry.id.slice(0, 8)}.webp`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function CustomerStylebookCollection({
  collection,
  activeView,
  actions,
  busy = false,
  message = "",
  routeBase = "/stylebook",
}: CustomerStylebookCollectionProps) {
  const [query, setQuery] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [collectionId, setCollectionId] = useState("");
  const [facet, setFacet] = useState("");
  const [sort, setSort] = useState<CustomerStylebookSortV2>("confirmed");
  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeEntry, setActiveEntry] = useState<CustomerStylebookEntryV2 | null>(null);
  const [dialog, setDialog] = useState<"manage" | "wear" | "share" | "collections" | "compare" | null>(null);
  const [localMessage, setLocalMessage] = useState("");

  const entries = useMemo(() => activeView === "sets" ? [] : filterCustomerStylebookEntriesV2(collection, activeView, {
    query,
    favoriteOnly,
    includeArchived,
    collectionId: collectionId || null,
    facet: facet || null,
    sort,
  }), [activeView, collection, collectionId, facet, favoriteOnly, includeArchived, query, sort]);

  const facets = useMemo(() => {
    if (activeView === "sets") return [];
    const values = collection[activeView].flatMap(customerStylebookFacetValuesV2)
      .filter((value) => value && !["hair", "fashion", "unknown", "personalized"].includes(value) && !value.startsWith("#") && value.length <= 24);
    return [...new Set(values)].slice(0, 10);
  }, [activeView, collection]);

  const selectedEntries = activeView === "sets" ? [] : collection[activeView].filter((entry) => selectedIds.includes(entry.id));
  const toggleCompare = (id: string) => {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= 3) {
        setLocalMessage("비교는 최대 3개까지 선택할 수 있습니다.");
        return current;
      }
      return [...current, id];
    });
  };
  const openEntry = (entry: CustomerStylebookEntryV2, nextDialog: "manage" | "wear" | "share") => {
    setActiveEntry(entry);
    setDialog(nextDialog);
  };
  const resetFilters = () => {
    setQuery(""); setFavoriteOnly(false); setIncludeArchived(false); setCollectionId(""); setFacet(""); setSort("confirmed");
  };

  const tabHref = (view: CustomerStylebookViewV2) => view === "hair" ? routeBase : `${routeBase}?view=${view}`;
  const resetViewState = () => {
    setSelectedIds([]);
    setCompareMode(false);
    setFacet("");
  };
  return (
    <div className="customer-stylebook" data-stylebook-view={activeView}>
      <nav className="customer-stylebook-tabs" aria-label="스타일북 분류">
        {([
          ["hair", "헤어 스타일", collection.hair.length],
          ["fashion", "패션 룩", collection.fashion.length],
          ["sets", "토털 세트", collection.sets.length],
        ] as const).map(([view, label, count]) => (
          <Link key={view} href={tabHref(view)} aria-current={activeView === view ? "page" : undefined} onClick={resetViewState}>{label} <span>{count}</span></Link>
        ))}
      </nav>

      {!collection.metadataAvailable ? (
        <p className="customer-stylebook-notice" role="status">검색과 비교는 사용할 수 있지만, 메모·컬렉션·실제 기록 저장은 데이터베이스 확장 적용 후 활성화됩니다.</p>
      ) : null}

      {activeView !== "sets" ? (
        <section className="customer-stylebook-toolbar" aria-label="스타일북 검색과 필터">
          <label className="customer-stylebook-search"><Search aria-hidden="true" /><span className="sr-only">스타일 검색</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="스타일명, 메모, 태그 검색" /></label>
          <div className="customer-stylebook-toolbar__controls">
            <button type="button" aria-pressed={favoriteOnly} onClick={() => setFavoriteOnly((value) => !value)}>즐겨찾기</button>
            <button type="button" aria-pressed={includeArchived} onClick={() => setIncludeArchived((value) => !value)}>보관함</button>
            <select aria-label="컬렉션 필터" value={collectionId} onChange={(event) => setCollectionId(event.target.value)}><option value="">전체 컬렉션</option>{collection.collections.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}</select>
            <select aria-label="정렬" value={sort} onChange={(event) => setSort(event.target.value as CustomerStylebookSortV2)}><option value="confirmed">컨설팅 최신순</option><option value="recent">최근 수정순</option><option value="favorite">즐겨찾기순</option><option value="satisfaction">만족도순</option></select>
            <button type="button" onClick={() => setDialog("collections")}><FolderHeart aria-hidden="true" /> 컬렉션</button>
            <button type="button" aria-pressed={compareMode} onClick={() => { setCompareMode((value) => !value); setSelectedIds([]); }}><CheckSquare2 aria-hidden="true" /> 비교</button>
          </div>
          {facets.length ? <div className="customer-stylebook-facets"><SlidersHorizontal aria-hidden="true" />{facets.map((value) => <button key={value} type="button" aria-pressed={facet === value} onClick={() => setFacet((current) => current === value ? "" : value)}>{humanFacet(value)}</button>)}{facet || query || favoriteOnly || includeArchived || collectionId ? <button type="button" onClick={resetFilters}><X aria-hidden="true" /> 초기화</button> : null}</div> : null}
        </section>
      ) : null}

      {message || localMessage ? <p className="customer-stylebook-status" role="status">{message || localMessage}</p> : null}

      {activeView === "sets" ? (
        collection.sets.length ? <section className="customer-stylebook-set-grid" aria-label="토털 스타일 세트">{collection.sets.map((set) => {
          const hair = collection.hair.find((entry) => entry.id === set.hairEntryId);
          const fashion = collection.fashion.find((entry) => entry.id === set.fashionEntryId);
          if (!hair || !fashion) return null;
          return <article key={set.id} className="customer-card customer-stylebook-set"><div className="customer-stylebook-set__visuals">{[hair, fashion].map((entry) => entry.imageUrl ? <img key={entry.id} src={entry.imageUrl} alt={customerStylebookDisplayTitleV2(entry)} /> : <span key={entry.id} aria-hidden="true">{entry.kind === "hair" ? "HF" : "LOOK"}</span>)}</div><div><p className="customer-kicker">Total style set</p><h2>{set.title}</h2><p>{set.mood}</p><div className="customer-stylebook-palette">{set.palette.slice(0, 5).map((color, index) => <span key={`${set.id}-${index}`} style={{ backgroundColor: safePaletteColor(color) }} />)}</div><Link href={`/consulting/${encodeURIComponent(set.consultationId)}/result?tab=fashion`}>통합 결과 보기 <ArrowRight aria-hidden="true" /></Link></div></article>;
        })}</section> : <section className="customer-card customer-empty-state"><p className="customer-kicker">Total style set</p><h2>같은 컨설팅의 헤어와 패션을 확정해 주세요</h2><p>두 결과가 모두 완성되면 하나의 토털 스타일 세트로 자동 구성됩니다.</p></section>
      ) : entries.length === 0 ? (
        <section className="customer-card customer-empty-state" data-stylebook-empty={activeView}>
          <p className="customer-kicker">Your collection</p>
          <h2>{query || facet || favoriteOnly || collectionId ? "조건에 맞는 스타일이 없어요" : activeView === "fashion" ? "아직 확정한 패션 룩이 없어요" : "첫 헤어 스타일을 만들어 볼까요?"}</h2>
          <p>{query || facet || favoriteOnly || collectionId ? "검색어나 필터를 바꿔 다시 확인해 보세요." : "컨설팅 마지막 단계에서 최종 확정한 결과가 자동으로 이곳에 모입니다."}</p>
          {query || facet || favoriteOnly || collectionId ? <button type="button" className="customer-primary-button" onClick={resetFilters}>필터 초기화</button> : <Link href="/consulting/new" className="customer-primary-button">컨설팅 시작 <ArrowRight aria-hidden="true" /></Link>}
        </section>
      ) : (
        <section className="customer-stylebook-grid" aria-label={activeView === "fashion" ? "확정한 패션 룩" : "확정한 헤어 스타일"}>
          {entries.map((entry) => <CustomerStylebookCard key={entry.id} entry={entry} compareMode={compareMode} selected={selectedIds.includes(entry.id)} onToggleFavorite={() => void actions.saveItemState({ kind: entry.kind, itemId: entry.id, favorite: !entry.state.favorite })} onToggleCompare={() => toggleCompare(entry.id)} onEdit={() => openEntry(entry, "manage")} onDownloadImage={() => void downloadStyleImage(entry).catch((error) => setLocalMessage(error instanceof Error ? error.message : "이미지를 내려받지 못했습니다."))} />)}
        </section>
      )}

      {compareMode && activeView !== "sets" ? <div className="customer-stylebook-compare-bar"><span>{selectedIds.length}/3개 선택</span><button type="button" disabled={selectedIds.length < 2} onClick={() => setDialog("compare")}>선택 결과 비교</button></div> : null}

      {activeEntry ? <CustomerStylebookManageDialog key={activeEntry.id} entry={activeEntry} collection={collection} open={dialog === "manage"} busy={busy} onOpenChange={(open) => setDialog(open ? "manage" : null)} onOpenWearLog={() => setDialog("wear")} onOpenShare={() => setDialog("share")} actions={actions} /> : null}
      {activeEntry ? <CustomerStylebookWearLogDialog key={`wear-${activeEntry.id}`} entry={activeEntry} open={dialog === "wear"} busy={busy} onOpenChange={(open) => setDialog(open ? "wear" : null)} actions={actions} /> : null}
      {activeEntry ? <CustomerStylebookShareDialog key={`share-${activeEntry.id}`} entry={activeEntry} collection={collection} open={dialog === "share"} busy={busy} onOpenChange={(open) => setDialog(open ? "share" : null)} actions={actions} /> : null}
      <CustomerStylebookCollectionDialog collection={collection} open={dialog === "collections"} busy={busy} onOpenChange={(open) => setDialog(open ? "collections" : null)} actions={actions} />
      <CustomerStylebookCompareDialog entries={selectedEntries} open={dialog === "compare"} onOpenChange={(open) => setDialog(open ? "compare" : null)} />
    </div>
  );
}
