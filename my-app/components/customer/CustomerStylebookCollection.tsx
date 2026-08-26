/* eslint-disable @next/next/no-img-element */

import type {
  CustomerStylebookFashionEntryV2,
  CustomerStylebookV2,
  CustomerStylebookViewV2,
} from "@hairfit/shared";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

const FASHION_CATEGORY_LABELS: Record<CustomerStylebookFashionEntryV2["category"], string> = {
  DAILY: "데일리",
  WORK: "워크",
  STATEMENT: "포인트",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
}

function safePaletteColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#A8863A";
}

interface CustomerStylebookCollectionProps {
  collection: CustomerStylebookV2;
  activeView: CustomerStylebookViewV2;
  routeBase?: string;
}

export function CustomerStylebookCollection({
  collection,
  activeView,
  routeBase = "/stylebook",
}: CustomerStylebookCollectionProps) {
  const entries = collection[activeView];
  const isFashion = activeView === "fashion";

  return (
    <div className="customer-stylebook" data-stylebook-view={activeView}>
      <nav className="customer-stylebook-tabs" aria-label="스타일북 분류">
        <Link href={routeBase} aria-current={!isFashion ? "page" : undefined}>
          헤어 스타일 <span>{collection.hair.length}</span>
        </Link>
        <Link href={`${routeBase}?view=fashion`} aria-current={isFashion ? "page" : undefined}>
          패션 룩 <span>{collection.fashion.length}</span>
        </Link>
      </nav>

      {entries.length === 0 ? (
        <section className="customer-card customer-empty-state" data-stylebook-empty={activeView}>
          <p className="customer-kicker">Your collection</p>
          <h2>{isFashion ? "아직 확정한 패션 룩이 없어요" : "첫 헤어 스타일을 만들어 볼까요?"}</h2>
          <p>
            {isFashion
              ? "컨설팅 마지막 단계에서 패션 룩을 확정하면 이곳에서 다시 확인할 수 있어요."
              : "컨설팅을 완료하면 최종 확정한 헤어 스타일이 자동으로 이곳에 모입니다."}
          </p>
          <Link href="/consulting/new" className="customer-primary-button">
            컨설팅 시작
            <ArrowRight aria-hidden="true" />
          </Link>
        </section>
      ) : (
        <section
          className="customer-stylebook-grid"
          aria-label={isFashion ? "확정한 패션 룩" : "확정한 헤어 스타일"}
        >
          {activeView === "hair"
            ? collection.hair.map((entry) => (
                <Link
                  key={entry.id}
                  href={`/consulting/${encodeURIComponent(entry.consultationId)}/result`}
                  className="customer-card customer-stylebook-card"
                  data-kind="hair"
                >
                  <div className="customer-stylebook-card__visual">
                    {entry.imageUrl ? (
                      <img src={entry.imageUrl} alt={entry.title} loading="lazy" decoding="async" />
                    ) : (
                      <div className="customer-stylebook-card__placeholder" aria-hidden="true">HF</div>
                    )}
                  </div>
                  <div className="customer-stylebook-card__body">
                    <div>
                      <p className="customer-kicker">컨설팅 최종 리포트</p>
                      <h2>{entry.title}</h2>
                      <p>{entry.description}</p>
                    </div>
                    <time dateTime={entry.confirmedAt}>{formatDate(entry.confirmedAt)}</time>
                  </div>
                </Link>
              ))
            : collection.fashion.map((entry) => (
                <Link
                  key={entry.id}
                  href={`/consulting/${encodeURIComponent(entry.consultationId)}/result?tab=fashion`}
                  className="customer-card customer-stylebook-card"
                  data-kind="fashion"
                >
                  <div className="customer-stylebook-card__visual">
                    {entry.imageUrl ? (
                      <img src={entry.imageUrl} alt={entry.title} loading="lazy" decoding="async" />
                    ) : (
                      <div className="customer-stylebook-card__placeholder" aria-hidden="true">LOOK</div>
                    )}
                    <span className="customer-stylebook-card__badge">최종 확정</span>
                  </div>
                  <div className="customer-stylebook-card__body customer-stylebook-card__body--fashion">
                    <div>
                      <p className="customer-kicker">
                        {FASHION_CATEGORY_LABELS[entry.category]} · {entry.genre}
                      </p>
                      <h2>{entry.title}</h2>
                      <p>{entry.silhouette} · {entry.neckline}</p>
                      <div className="customer-stylebook-palette" aria-label={`추천 팔레트 ${entry.palette.length}색`}>
                        {entry.palette.slice(0, 5).map((color, index) => (
                          <span
                            key={`${entry.id}-${color}-${index}`}
                            style={{ backgroundColor: safePaletteColor(color) }}
                            title={color}
                          />
                        ))}
                      </div>
                    </div>
                    <time dateTime={entry.confirmedAt}>{formatDate(entry.confirmedAt)}</time>
                  </div>
                </Link>
              ))}
        </section>
      )}
    </div>
  );
}
