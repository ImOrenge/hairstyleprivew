import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Check, CircleAlert, EyeOff } from "lucide-react";
import type { ReactNode } from "react";
import { consultationReportStatusLabelV2, type ConsultationReportImageV2, type ConsultationReportSectionV2, type ConsultationReportStatusV2 } from "../../../lib/consulting/contracts";
import { MakeupProfessionalReport } from "../makeup/MakeupProfessionalReport";

const PIE_COLORS = ["#d7a84b", "#8164b8", "#4f8f85", "#b65f6a", "#557ea8", "#8d784e"];

function safeColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#8b8174";
}

function StatusStamp({ status }: { status: ConsultationReportStatusV2 }) {
  const Icon = status === "ready" ? Check : status === "redacted" ? EyeOff : CircleAlert;
  return (
    <span data-report-status={status} className="f-consulting-report__status inline-flex items-center gap-1.5 border border-[var(--app-border)] px-2 py-1 text-[0.68rem] font-black uppercase tracking-[0.05em]">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {consultationReportStatusLabelV2(status)}
    </span>
  );
}

function ReportImage({ image, className = "" }: { image: ConsultationReportImageV2; className?: string }) {
  return (
    <figure data-report-keep="true" className={`f-consulting-report-v2__image grid gap-2 border border-[var(--app-border)] p-2 ${className}`}>
      {image.src ? <Image src={image.src} alt={image.alt} width={720} height={900} unoptimized className="aspect-[4/5] w-full object-cover" /> : <div className="grid aspect-[4/5] place-items-center bg-[var(--app-surface-muted)] text-xs font-bold">{image.status === "failed" ? "이미지를 불러오지 못함" : "이미지 준비 중"}</div>}
      <figcaption className="text-xs font-bold">{image.label}</figcaption>
    </figure>
  );
}

function DefinitionGrid({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) {
  if (!rows.length) return null;
  return (
    <dl className="f-consulting-report__definitions mt-6 grid border-t border-[var(--app-border)] sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="grid gap-1 border-b border-[var(--app-border)] py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
          <dt className="text-xs font-black uppercase tracking-[0.03em] text-[var(--app-muted)]">{row.label}</dt>
          <dd className="m-0 break-words text-sm font-bold leading-6">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function FaceShapePie({ distribution }: { distribution: Array<{ label: string; probability: number }> }) {
  if (!distribution.length) return <p className="mt-5 border border-dashed border-[var(--app-border)] p-4 text-sm text-[var(--app-muted)]">정밀 얼굴형 분포는 현재 결과에 포함되지 않았습니다.</p>;
  const stops = distribution.reduce<{ cursor: number; values: string[] }>(
    (result, item, index) => {
      const end = result.cursor + Math.max(0, Math.min(1, item.probability)) * 100;
      return {
        cursor: end,
        values: [...result.values, `${PIE_COLORS[index % PIE_COLORS.length]} ${result.cursor}% ${end}%`],
      };
    },
    { cursor: 0, values: [] },
  ).values;
  return (
    <div className="f-consulting-report-v2__pie-layout mt-6 grid gap-5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
      <div role="img" aria-label={distribution.map((item) => `${item.label} ${Math.round(item.probability * 100)}%`).join(", ")} className="f-consulting-report-v2__pie" style={{ background: `conic-gradient(${stops.join(",")})` }} />
      <ul className="grid gap-2 text-sm">
        {distribution.map((item, index) => (
          <li key={item.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span
                className="h-3 w-3 border border-black/20"
                style={{
                  backgroundColor: PIE_COLORS[index % PIE_COLORS.length],
                }}
              />
              {item.label}
            </span>
            <strong>{Math.round(item.probability * 100)}%</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CommonBlocks({ section, explanationCovered = false }: { section: ConsultationReportSectionV2; explanationCovered?: boolean }) {
  const blocks = [
    ["이 결과가 잘 맞는 이유", explanationCovered ? [] : section.rationale],
    ["기대할 수 있는 변화", explanationCovered ? [] : section.effects],
    ["피하면 좋은 선택", section.avoid],
    ["시술 전 확인할 점", section.cautions],
  ] as const;
  return (
    <>
      {blocks
        .filter(([, items]) => items.length)
        .map(([label, items]) => (
          <div key={label} className="mt-6 border-l-2 border-[var(--app-border-strong)] pl-4">
            <h4 className="text-xs font-black uppercase tracking-[0.04em] text-[var(--app-muted)]">{label}</h4>
            <ul className="mt-2 grid gap-1 text-sm leading-6">
              {items.map((item, index) => (
                <li key={`${label}-${index}`}>— {item}</li>
              ))}
            </ul>
          </div>
        ))}
    </>
  );
}

function generationStateLabel(value: string) {
  if (["accepted", "completed", "selected"].includes(value)) return "완성";
  if (["pending", "queued", "generating", "running"].includes(value)) return "준비 중";
  if (value === "failed") return "다시 준비 필요";
  return "확인 중";
}

function SectionPayload({ section, onRetryMakeupReport }: { section: ConsultationReportSectionV2; onRetryMakeupReport?: () => void }) {
  switch (section.key) {
    case "face-hair-analysis":
      return (
        <>
          <FaceShapePie distribution={section.payload.distribution} />
          <DefinitionGrid
            rows={[
              {
                label: "가장 가까운 얼굴형",
                value: section.payload.primary ?? "확인 불가",
              },
              {
                label: "두 번째 얼굴형",
                value: section.payload.secondary ?? "혼합 근거 없음",
              },
              { label: "분석 신뢰도", value: section.payload.confidence },
              ...section.payload.observations.map((item) => ({
                label: item.label,
                value: item.value,
              })),
              ...section.payload.measurements.map((item) => ({
                label: item.label,
                value: `${item.value}${item.confidence === null ? "" : ` · 신뢰도 ${Math.round(item.confidence * 100)}%`}`,
              })),
            ]}
          />
        </>
      );
    case "hair-direction":
      return (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {section.payload.axes.map((axis) => (
            <article key={axis.label} className="border border-[var(--app-border)] p-4">
              <p className="text-xs font-black uppercase text-[var(--app-muted)]">{axis.label}</p>
              <p className="mt-2 text-lg font-black">{axis.value}</p>
              {axis.reason ? <p className="mt-2 text-sm leading-6">{axis.reason}</p> : null}
              {axis.impact ? <p className="mt-2 text-xs text-[var(--app-muted)]">{axis.impact}</p> : null}
            </article>
          ))}
        </div>
      );
    case "candidate-comparison":
      return (
        <>
          <DefinitionGrid
            rows={[
              {
                label: "준비된 스타일",
                value: `${section.payload.acceptedCount}개 완성 · 전체 ${section.payload.requestedCount}개 비교`,
              },
              {
                label: "비교 방법",
                value: "추천 표시와 확정 표시를 함께 보며 원하는 인상을 비교하세요.",
              },
            ]}
          />
          <div data-report-generated-gallery="hair-all" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.payload.candidates.map((candidate, index) => (
              <article key={candidate.id} data-generated-item={candidate.id} data-generation-state={candidate.generationState} className="grid content-start gap-3 border border-[var(--app-border)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="app-kicker">스타일 {index + 1}</p>
                  <div className="flex flex-wrap gap-1">
                    {candidate.rank ? <span className="f-consulting-report__status border border-[var(--app-border)] px-2 py-1 text-[0.65rem] font-black">AI 추천 {candidate.rank}순위</span> : null}
                    {candidate.isPrimary ? <span className="f-consulting-report__status border border-[var(--app-accent)] px-2 py-1 text-[0.65rem] font-black">가장 추천</span> : null}
                    {candidate.isConfirmed ? <span className="f-consulting-report__status border border-[var(--app-border-strong)] px-2 py-1 text-[0.65rem] font-black">내가 확정</span> : null}
                  </div>
                </div>
                <ReportImage image={candidate.image} />
                <h4 className="font-black">{candidate.label}</h4>
                <p className="text-xs font-bold text-[var(--app-muted)]">
                  {candidate.axis} · {generationStateLabel(candidate.generationState)}
                </p>
                <p className="text-sm leading-6 text-[var(--app-muted)]">{candidate.reason}</p>
              </article>
            ))}
          </div>
        </>
      );
    case "final-hair":
      return (
        <div className="mt-6 grid gap-5 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <ReportImage image={section.payload.image} />
          <DefinitionGrid
            rows={[
              { label: "확정 스타일", value: section.payload.label },
              { label: "구현 가능성", value: section.payload.feasibility },
              {
                label: "현재 모발과 차이",
                value: section.payload.currentHairGap,
              },
              {
                label: "필요 시술",
                value: section.payload.services.join(" · ") || "별도 시술 없음",
              },
              { label: "관리 난이도", value: section.payload.maintenance },
            ]}
          />
        </div>
      );
    case "personal-color":
      return (
        <>
          <DefinitionGrid
            rows={[
              {
                label: "진단",
                value: section.payload.classification ?? "확인 불가",
              },
              {
                label: "경계 유형",
                value: section.payload.secondary ?? "없음",
              },
              {
                label: "촬영 신뢰도",
                value: section.payload.confidence.capture === null ? "확인 불가" : `${Math.round(section.payload.confidence.capture * 100)}%`,
              },
              {
                label: "진단 신뢰도",
                value: section.payload.confidence.diagnosis === null ? "확인 불가" : `${Math.round(section.payload.confidence.diagnosis * 100)}%`,
              },
            ]}
          />
          {section.payload.posterior.length ? (
            <div className="mt-6">
              <h4 className="text-xs font-black uppercase text-[var(--app-muted)]">12타입 분포</h4>
              <div className="mt-3 grid gap-2">
                {section.payload.posterior.map((item) => (
                  <div key={item.label} className="grid grid-cols-[8rem_minmax(0,1fr)_3rem] items-center gap-3 text-xs">
                    <span>{item.label}</span>
                    <span className="h-2 bg-[var(--app-surface-muted)]">
                      <span
                        className="block h-full bg-[var(--app-accent)]"
                        style={{
                          width: `${Math.max(0, Math.min(100, item.probability * 100))}%`,
                        }}
                      />
                    </span>
                    <strong>{Math.round(item.probability * 100)}%</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {section.payload.axes.map((axis) => (
              <div key={axis.key} className="border border-[var(--app-border)] p-3">
                <div className="flex justify-between gap-3 text-xs font-black">
                  <span>{axis.label}</span>
                  <span>{axis.value === null ? "확인 불가" : Math.round(axis.value * 100)}</span>
                </div>
                <div className="mt-2 h-2 bg-[var(--app-surface-muted)]">
                  <span
                    className="block h-full bg-[var(--app-accent)]"
                    style={{
                      width: axis.value === null ? "0%" : `${Math.max(0, Math.min(100, (axis.value + 1) * 50))}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Object.entries(section.payload.palettes).map(([label, colors]) => (
              <div key={label}>
                <h4 className="text-xs font-black uppercase text-[var(--app-muted)]">{label}</h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  {colors.map((color) => (
                    <span key={`${label}-${color}`} title={color} aria-label={color} className="h-8 w-8 border border-black/20" style={{ backgroundColor: safeColor(color) }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      );
    case "final-color":
      return (
        <div className="mt-6 grid gap-5 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          {section.payload.image ? <ReportImage image={section.payload.image} /> : <div className="grid min-h-48 place-items-center border border-dashed border-[var(--app-border)] text-sm text-[var(--app-muted)]">현재 모발색 유지 또는 이미지 없는 결정</div>}
          <DefinitionGrid
            rows={[
              { label: "결정", value: section.payload.state },
              {
                label: "컬러",
                value: (
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-5 w-5 border border-black/20"
                      style={{
                        backgroundColor: safeColor(section.payload.swatchHex),
                      }}
                    />
                    {section.payload.colorName}
                  </span>
                ),
              },
              { label: "기법", value: section.payload.technique },
              {
                label: "목표 레벨",
                value: section.payload.targetLevel ?? "현장 확인",
              },
              { label: "탈색", value: section.payload.bleachPolicy },
              {
                label: "퇴색 방향",
                value: section.payload.fadeDirection || "확인 필요",
              },
            ]}
          />
        </div>
      );
    case "makeup-result":
      if (section.payload.professionalReport && section.payload.routine && section.payload.artistBrief)
        return (
          <div className="mt-6 grid gap-5">
            {section.payload.moodImage ? <ReportImage image={section.payload.moodImage} className="max-w-sm" /> : null}
            <MakeupProfessionalReport report={section.payload.professionalReport} routine={section.payload.routine} brief={section.payload.artistBrief} onRetry={onRetryMakeupReport} />
          </div>
        );
      return (
        <>
          {section.payload.moodImage ? <ReportImage image={section.payload.moodImage} className="mt-6 max-w-sm" /> : null}
          <DefinitionGrid
            rows={[
              {
                label: "원한 분위기",
                value: section.payload.requestedMode ?? "기존 방식",
              },
              {
                label: "확정한 분위기",
                value: section.payload.acceptedMode ?? "확인 불가",
              },
              {
                label: "추천 반영",
                value: section.payload.adjustmentDecision === "accept_adjustment" ? "AI 제안 반영" : section.payload.adjustmentDecision === "keep_selection" ? "내 선택 유지" : "별도 조정 없음",
              },
            ]}
          />
          {section.payload.evidence.length ? (
            <div className="mt-6 grid gap-3 md:grid-cols-5">
              {section.payload.evidence.map((item) => (
                <article key={item.label} className="border border-[var(--app-border)] p-3">
                  <p className="text-xs font-black text-[var(--app-muted)]">{item.label}</p>
                  <p className="mt-2 font-black">{item.finding}</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--app-muted)]">{item.impact}</p>
                </article>
              ))}
            </div>
          ) : null}
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {section.payload.modules.map((module) => (
              <article key={module.module} className="border border-[var(--app-border)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-black">{module.module}</h4>
                  <span className="text-xs font-bold">{module.enabled ? "사용" : "제외"}</span>
                </div>
                {module.color ? <p className="mt-3 text-sm">색상 · {module.color}</p> : null}
                {module.texture ? <p className="mt-1 text-sm">질감 · {module.texture}</p> : null}
                {module.intensity !== null ? <p className="mt-1 text-sm">강도 · {module.intensity}%</p> : null}
              </article>
            ))}
          </div>
        </>
      );
    case "fashion-result":
      return (
        <>
          <DefinitionGrid
            rows={[
              {
                label: "준비된 코디",
                value: `${section.payload.completedCount}개 완성 · 전체 ${section.payload.requestedCount}개 비교`,
              },
              {
                label: "비교 방법",
                value: "추천 표시와 확정 표시를 함께 보며 활용할 코디를 비교하세요.",
              },
            ]}
          />
          <div data-report-generated-gallery="fashion-all" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.payload.looks.map((look, index) => (
              <article key={look.id} data-generated-item={look.id} data-generation-state={look.generationState} className="grid content-start gap-3 border border-[var(--app-border)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="app-kicker">코디 {index + 1}</p>
                  <div className="flex flex-wrap gap-1">
                    {look.isRecommended ? <span className="f-consulting-report__status border border-[var(--app-accent)] px-2 py-1 text-[0.65rem] font-black">AI 추천</span> : null}
                    {look.isSelected ? <span className="f-consulting-report__status border border-[var(--app-border-strong)] px-2 py-1 text-[0.65rem] font-black">내가 확정</span> : null}
                  </div>
                </div>
                {look.image ? <ReportImage image={look.image} /> : <div className="grid aspect-[4/5] place-items-center border border-dashed border-[var(--app-border)] text-xs font-bold text-[var(--app-muted)]">{generationStateLabel(look.generationState)}</div>}
                <h4 className="text-lg font-black">{look.label}</h4>
                <p className="text-sm">
                  {look.silhouette} · {look.neckline}
                </p>
                <p className="text-xs leading-5 text-[var(--app-muted)]">{look.items.join(" · ")}</p>
                <div className="flex flex-wrap gap-1">
                  {look.palette.map((color) => (
                    <span key={color} className="h-6 w-6 border border-black/20" style={{ backgroundColor: safeColor(color) }} aria-label={color} title={color} />
                  ))}
                </div>
              </article>
            ))}
          </div>
          {section.payload.products.length ? (
            <div className="mt-8">
              <h4 className="text-lg font-black">추천에 참고한 실제 상품</h4>
              <p className="mt-2 text-sm text-[var(--app-muted)]">생성 이미지와 실제 상품은 별도 정보이며 가격과 재고는 확인한 시점에 따라 달라질 수 있습니다.</p>
              <div data-report-product-gallery="all" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {section.payload.products.map((product) => (
                  <article key={product.snapshotId} className="grid gap-2 border border-[var(--app-border)] p-4">
                    <p className="app-kicker">{product.brandName}</p>
                    <h5 className="font-black">{product.productName}</h5>
                    <p className="text-sm">
                      {product.priceAmount.toLocaleString("ko-KR")} {product.currency} · {product.availability}
                    </p>
                    <p className="text-xs text-[var(--app-muted)]">사이즈 {product.availableSizes.join(" · ") || "미확인"}</p>
                    <p className="text-xs text-[var(--app-muted)]">정보 확인일 {product.observedAt}</p>
                    <a href={product.productUrl} target="_blank" rel="noreferrer sponsored" className="mt-2 inline-flex min-h-11 items-center gap-2 border border-[var(--app-border)] px-3 py-2 text-sm font-black">
                      상품 확인
                      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    </a>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </>
      );
    case "executive-summary":
      return (
        <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          {section.payload.heroImage ? <ReportImage image={section.payload.heroImage} /> : <div className="grid min-h-64 place-items-center border border-dashed border-[var(--app-border)] text-sm text-[var(--app-muted)]">확정 대표 이미지가 없습니다.</div>}
          <div>
            <DefinitionGrid
              rows={[
                ...section.payload.outcomes.map((item) => ({
                  label: String(item.label),
                  value: item.value,
                })),
                { label: "변화 강도", value: section.payload.changeIntensity },
                {
                  label: "관리 난이도",
                  value: section.payload.maintenanceDifficulty,
                },
                {
                  label: "살롱 시술",
                  value: section.payload.salonRequired ? "필요" : "선택",
                },
              ]}
            />
          </div>
        </div>
      );
    case "salon-specification":
      return (
        <>
          <DefinitionGrid
            rows={[
              {
                label: "커트",
                value: section.payload.services.cut.join(" · ") || "없음",
              },
              {
                label: "펌",
                value: section.payload.services.perm.join(" · ") || "없음",
              },
              {
                label: "컬러",
                value: section.payload.services.color.join(" · ") || "없음",
              },
              ...section.payload.design.map((item) => ({
                label: item.label,
                value: item.value,
              })),
            ]}
          />
          <details className="f-consulting-report-v2__professional mt-6 border border-[var(--app-border)] p-4">
            <summary className="cursor-pointer font-black">디자이너용 상세 명세</summary>
            <div className="mt-4 grid gap-4 text-sm leading-6">
              <div>
                <h4 className="font-black">스타일링</h4>
                <p>{section.payload.styling.join(" · ") || "별도 항목 없음"}</p>
              </div>
              <div>
                <h4 className="font-black">주의사항</h4>
                <p>{section.payload.cautions.join(" · ") || "별도 항목 없음"}</p>
              </div>
              {section.payload.unresolved.length ? (
                <div>
                  <h4 className="font-black">현장 재확인</h4>
                  <p>{section.payload.unresolved.join(" · ")}</p>
                </div>
              ) : null}
            </div>
          </details>
        </>
      );
    case "initial-care":
      return (
        <>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {section.payload.periods.map((period) => (
              <article key={period.label} className="border border-[var(--app-border)] p-4">
                <h4 className="font-black">{period.label}</h4>
                <ul className="mt-3 grid gap-2 text-sm leading-6">
                  {period.actions.map((action) => (
                    <li key={action}>— {action}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <div className="mt-6 border border-[var(--app-border)] p-4">
            <h4 className="font-black">초기 케어 체크리스트</h4>
            <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {section.payload.checklist.map((item) => (
                <li key={item} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </>
      );
  }
}

export function ReportSectionV2({ section, onRetryMakeupReport, explanationCovered = false }: { section: ConsultationReportSectionV2; onRetryMakeupReport?: () => void; explanationCovered?: boolean }) {
  const hasDedicatedMakeupReport = section.key === "makeup-result" && Boolean(section.payload.professionalReport);
  return (
    <section id={`report-${section.key}`} data-report-section="true" data-report-section-key={section.key} className="f-consulting-report__section border-b border-[var(--app-border)] p-5 last:border-b-0 sm:p-8">
      <div data-report-keep="true" className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="app-kicker">{section.kicker}</p>
          <h3 className="mt-2 text-xl font-black sm:text-2xl">{section.title}</h3>
          <p className="mt-3 max-w-3xl text-base font-bold leading-7">{section.conclusion}</p>
        </div>
        <StatusStamp status={section.status} />
      </div>
      <SectionPayload section={section} onRetryMakeupReport={onRetryMakeupReport} />
      {!hasDedicatedMakeupReport ? <CommonBlocks section={section} explanationCovered={explanationCovered} /> : null}
      {section.detailHref ? (
        <div className="mt-6" data-report-screen-only="true">
          <Link href={section.detailHref} className="inline-flex min-h-11 items-center gap-2 border border-[var(--app-border)] px-4 py-2 text-sm font-black hover:border-[var(--app-border-strong)]">
            {section.title} 상세 보기
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </section>
  );
}
