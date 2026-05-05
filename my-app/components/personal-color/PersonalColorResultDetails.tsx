import type { PersonalColorResult, PersonalColorSwatch } from "../../lib/fashion-types";

export function hasDetailedPersonalColorResult(result: PersonalColorResult | null | undefined) {
  return result?.detailVersion === "color-detail-v1";
}

function formatTone(value: PersonalColorResult["tone"]) {
  if (value === "warm") return "웜톤";
  if (value === "cool") return "쿨톤";
  return "뉴트럴";
}

function formatContrast(value: PersonalColorResult["contrast"]) {
  if (value === "low") return "낮은 대비";
  if (value === "high") return "높은 대비";
  return "중간 대비";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function SwatchPill({ swatch }: { swatch: PersonalColorSwatch }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 py-1 text-xs font-bold text-[var(--app-text)]">
      <span
        aria-hidden="true"
        className="h-4 w-4 shrink-0 rounded-full border border-black/10"
        style={{ backgroundColor: swatch.hex }}
      />
      {swatch.nameKo}
    </span>
  );
}

function SimpleSwatchList({ colors }: { colors: PersonalColorSwatch[] }) {
  if (!colors.length) {
    return <p className="text-sm text-[var(--app-muted)]">저장된 색상이 없습니다.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {colors.slice(0, 6).map((swatch) => (
        <SwatchPill key={`${swatch.nameEn}-${swatch.hex}`} swatch={swatch} />
      ))}
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return null;
  }

  return (
    <div>
      <p className="text-[11px] font-black uppercase text-[var(--app-muted)]">{label}</p>
      <p className="mt-1 text-sm leading-6 text-[var(--app-text)]">{value}</p>
    </div>
  );
}

function ColorCombinationList({ swatch }: { swatch: PersonalColorSwatch }) {
  if (!swatch.colorCombinations?.length) {
    return null;
  }

  return (
    <div>
      <p className="text-[11px] font-black uppercase text-[var(--app-muted)]">컬러 조합</p>
      <div className="mt-2 grid gap-2">
        {swatch.colorCombinations.map((combination, index) => (
          <div
            key={`${swatch.hex}-${combination.title}-${index}`}
            className="border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-black text-[var(--app-text)]">{combination.title}</p>
              <span className="flex overflow-hidden rounded-[var(--app-radius-control)] border border-black/10">
                {combination.hexes.map((hex) => (
                  <span
                    key={`${combination.title}-${hex}`}
                    aria-hidden="true"
                    className="h-4 w-5"
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-[var(--app-muted)]">{combination.reason}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ColorDetailCard({ swatch }: { swatch: PersonalColorSwatch }) {
  return (
    <article className="border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 h-8 w-8 shrink-0 rounded-full border border-black/10"
          style={{ backgroundColor: swatch.hex }}
        />
        <div className="min-w-0">
          <h4 className="text-base font-black text-[var(--app-text)]">
            {swatch.nameKo} <span className="text-sm font-bold text-[var(--app-muted)]">({swatch.nameEn})</span>
          </h4>
          <p className="mt-1 text-xs font-bold uppercase text-[var(--app-muted)]">{swatch.hex}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <DetailLine label="추천 근거" value={swatch.recommendationReason || swatch.reason} />
        <DetailLine label="비추천 근거" value={swatch.nonRecommendationReason} />
        <DetailLine label="색상의 의미" value={swatch.meaning} />
        <DetailLine label="스타일링 팁" value={swatch.stylingTip} />
        <ColorCombinationList swatch={swatch} />
      </div>
    </article>
  );
}

function DetailedSection({ colors, title }: { colors: PersonalColorSwatch[]; title: string }) {
  return (
    <section>
      <h3 className="text-lg font-black text-[var(--app-text)]">{title}</h3>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {colors.map((swatch) => (
          <ColorDetailCard key={`${title}-${swatch.nameEn}-${swatch.hex}`} swatch={swatch} />
        ))}
      </div>
    </section>
  );
}

export function PersonalColorResultDetails({ result }: { result: PersonalColorResult }) {
  const hasDetails = hasDetailedPersonalColorResult(result);

  return (
    <div className="grid gap-5">
      <div>
        <p className="app-kicker">Personal Color Result</p>
        <h2 className="mt-2 text-2xl font-black text-[var(--app-text)]">
          {formatTone(result.tone)} · {formatContrast(result.contrast)}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">{result.summary}</p>
        <p className="mt-2 text-xs font-medium text-[var(--app-subtle)]">
          신뢰도 {Math.round(result.confidence * 100)}% · {formatDate(result.diagnosedAt)}
        </p>
      </div>

      {!hasDetails ? (
        <div className="grid gap-4">
          <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-800">
            이 결과는 이전 버전 진단입니다. 색상별 추천근거, 비추천근거, 컬러조합, 색상의 의미는 새로 진단하면 제공됩니다.
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-bold uppercase text-[var(--app-muted)]">추천 색상</p>
              <SimpleSwatchList colors={result.bestColors} />
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase text-[var(--app-muted)]">주의 색상</p>
              <SimpleSwatchList colors={result.avoidColors} />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-6">
          <DetailedSection title="추천 색상 상세" colors={result.bestColors} />
          <DetailedSection title="주의 색상 상세" colors={result.avoidColors} />
        </div>
      )}

      {result.hairColorHints.length ? (
        <section>
          <h3 className="text-lg font-black text-[var(--app-text)]">헤어 컬러 힌트</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {result.hairColorHints.map((hint) => (
              <span
                key={hint}
                className="rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1 text-xs font-bold text-[var(--app-text)]"
              >
                {hint}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
