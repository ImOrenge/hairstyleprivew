/* eslint-disable @next/next/no-img-element */
import type { CustomerStylebookEntryV2 } from "@hairfit/shared";
import { customerStylebookDisplayTitleV2 } from "@hairfit/shared";
import { Check, FileText, Heart, ImageDown, Settings2 } from "lucide-react";
import Link from "next/link";

const FASHION_CATEGORY_LABELS = { DAILY: "데일리", WORK: "워크", STATEMENT: "포인트" } as const;

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
}

function safePaletteColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#A8863A";
}

export function stylebookResultHref(entry: CustomerStylebookEntryV2) {
  const base = `/consulting/${encodeURIComponent(entry.consultationId)}/result`;
  return entry.kind === "fashion" ? `${base}?tab=fashion` : base;
}

export function CustomerStylebookCard({
  entry,
  compareMode,
  selected,
  onToggleFavorite,
  onToggleCompare,
  onEdit,
  onDownloadImage,
}: {
  entry: CustomerStylebookEntryV2;
  compareMode: boolean;
  selected: boolean;
  onToggleFavorite: () => void;
  onToggleCompare: () => void;
  onEdit: () => void;
  onDownloadImage: () => void;
}) {
  const title = customerStylebookDisplayTitleV2(entry);
  const subtitle = entry.kind === "hair"
    ? entry.description
    : `${entry.silhouette} · ${entry.neckline}`;
  return (
    <article
      className="customer-card customer-stylebook-card"
      data-kind={entry.kind}
      data-selected={selected ? "true" : "false"}
      data-archived={entry.state.archivedAt ? "true" : "false"}
    >
      <div className="customer-stylebook-card__visual">
        {entry.imageUrl ? (
          <img src={entry.imageUrl} alt={title} loading="lazy" decoding="async" />
        ) : (
          <div className="customer-stylebook-card__placeholder" aria-hidden="true">
            {entry.kind === "hair" ? "HF" : "LOOK"}
          </div>
        )}
        {entry.kind === "fashion" ? <span className="customer-stylebook-card__badge">최종 확정</span> : null}
        <button
          type="button"
          className="customer-stylebook-card__favorite"
          aria-label={entry.state.favorite ? `${title} 즐겨찾기 해제` : `${title} 즐겨찾기`}
          aria-pressed={entry.state.favorite}
          onClick={onToggleFavorite}
        >
          <Heart aria-hidden="true" fill={entry.state.favorite ? "currentColor" : "none"} />
        </button>
        {compareMode ? (
          <button
            type="button"
            className="customer-stylebook-card__select"
            aria-label={`${title} 비교 ${selected ? "선택 해제" : "선택"}`}
            aria-pressed={selected}
            onClick={onToggleCompare}
          >
            <Check aria-hidden="true" /> {selected ? "선택됨" : "비교 선택"}
          </button>
        ) : null}
      </div>
      <div className="customer-stylebook-card__body">
        <div>
          <p className="customer-kicker">
            {entry.kind === "hair" ? "컨설팅 최종 리포트" : `${FASHION_CATEGORY_LABELS[entry.category]} · ${entry.genre}`}
          </p>
          <h2>{title}</h2>
          <p>{subtitle}</p>
          {entry.kind === "fashion" ? (
            <div className="customer-stylebook-palette" aria-label={`추천 팔레트 ${entry.palette.length}색`}>
              {entry.palette.slice(0, 5).map((color, index) => (
                <span key={`${entry.id}-${color}-${index}`} style={{ backgroundColor: safePaletteColor(color) }} title={color} />
              ))}
            </div>
          ) : null}
          {entry.state.tags.length ? (
            <div className="customer-stylebook-card__tags">
              {entry.state.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          ) : null}
        </div>
        <time dateTime={entry.confirmedAt}>{formatDate(entry.confirmedAt)}</time>
      </div>
      <div className="customer-stylebook-card__actions">
        <Link href={stylebookResultHref(entry)}><FileText aria-hidden="true" /> 결과 보기</Link>
        <button type="button" onClick={onEdit}><Settings2 aria-hidden="true" /> 관리</button>
        <button type="button" onClick={onDownloadImage} disabled={!entry.imageUrl}><ImageDown aria-hidden="true" /> 이미지</button>
      </div>
    </article>
  );
}
