import { ArrowRight, Check, Clock3, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { LandingScene, SceneHeader } from "./LandingScene";

const strategyAxes = [
  { axis: "BALANCE", label: "균형 보정", note: "관자 폭과 정수리 높이를 함께 조정" },
  { axis: "IMAGE", label: "인상 설계", note: "단정함을 유지하며 선을 부드럽게" },
  { axis: "LIFESTYLE", label: "생활 적합성", note: "아침 10분, 8주 관리 주기 기준" },
] as const;

const previewCells = [
  ["Balance", "Soft", "Daily"],
  ["Balance", "Defined", "Daily"],
  ["Balance", "Soft", "Statement"],
  ["Image", "Soft", "Daily"],
  ["Image", "Defined", "Daily"],
  ["Image", "Soft", "Statement"],
  ["Lifestyle", "Soft", "Daily"],
  ["Lifestyle", "Defined", "Daily"],
  ["Lifestyle", "Soft", "Statement"],
] as const;

const dossierCurrent = [
  "분석 근거와 얼굴 랜드마크",
  "확정한 전략과 비교 후보",
  "변경 불가 최종 결정 기록",
  "살롱 브리프와 시술 후 애프터케어",
  "패션 9-look 방향",
] as const;

const dossierPlanned = ["PDF 내보내기", "연간 Style Archive", "전문가 검수 리포트"] as const;

export function AnalysisEvidenceShowcase() {
  return (
    <LandingScene id="analysis-evidence" number="02" layout="editorial-split" tone="quiet">
      <div className="f-premium-split">
        <div className="f-premium-media" data-landing-media data-detail-closeup data-reveal-item data-reveal-order="1">
          <Image
            src="/landing/editorial/criteria-face-shape-landmark-system.webp"
            alt="정면 얼굴 위에 다점 랜드마크와 얼굴 비율선이 표시된 분석 근거 화면"
            fill
            sizes="(max-width: 840px) 92vw, 52vw"
          />
          <span className="f-premium-media__badge">Analysis Evidence · sample</span>
        </div>
        <div>
          <SceneHeader
            eyebrow="Analysis Evidence"
            title="추천보다 먼저, 판단의 근거를 보여드립니다."
            description="사진 품질을 확인한 뒤 얼굴 랜드마크와 관찰 근거를 연결합니다. 결과만 제시하지 않고 어떤 비율과 조건이 방향에 영향을 주었는지 확인할 수 있습니다."
          />
          <dl className="f-premium-metrics" data-reveal-item data-reveal-order="4">
            <div><dt>FACE BALANCE</dt><dd>세로 비율 안정 · 관자 폭 보정 필요</dd></div>
            <div><dt>HAIR CONDITION</dt><dd>중간 길이 · 직모 · 손상 낮음</dd></div>
            <div><dt>EVIDENCE STATUS</dt><dd><ShieldCheck aria-hidden="true" /> 분석 근거 연결됨</dd></div>
          </dl>
          <p className="f-premium-proof-note" data-reveal-item data-reveal-order="5">표시 값은 실제 V2 분석 필드 구조를 설명하기 위한 개인정보 비식별 샘플입니다.</p>
        </div>
      </div>
    </LandingScene>
  );
}

export function DirectionShowcase() {
  return (
    <LandingScene id="user-direction" number="03" layout="typographic-index">
      <SceneHeader
        eyebrow="User Direction"
        title="AI의 답을 받는 대신, 나의 기준으로 전략을 조정합니다."
        description="원하는 변화, 관리 가능한 범위, 피하고 싶은 요소를 입력하면 전략과 생성 브리프에 같은 기준이 이어집니다."
      />
      <div className="f-premium-direction" data-reveal-item data-reveal-order="4">
        <div className="f-premium-direction__input">
          <span>USER INPUT</span>
          <strong>적당한 변화 · 아침 10분 · 8주 관리</strong>
          <p>짧은 앞머리와 강한 컬은 피하고, 염색·펌·커트는 허용</p>
        </div>
        <ArrowRight aria-hidden="true" />
        <div className="f-premium-direction__output">
          <span>AI STRATEGY</span>
          <strong>부드러운 윤곽 + 정수리 균형</strong>
          <p>사용자 제약을 우선하는 추천·생성 기준으로 저장</p>
        </div>
      </div>
      <Link href="/consulting/new" className="f-landing-cta" data-reveal-item data-reveal-order="5">
        프라이빗 컨설팅 시작 <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </LandingScene>
  );
}

export function StrategicPreviewShowcase() {
  return (
    <LandingScene id="strategic-preview" number="04" layout="sticky-stage" motion="scroll-progress" tone="quiet">
      <SceneHeader
        eyebrow="Strategic Preview"
        title="9개 이미지를 만들기 전에, 3개의 전략축을 설계합니다."
        description="Balance, Image, Lifestyle 축을 교차한 3×3 프리뷰로 변화의 폭과 현실성을 함께 비교합니다."
      />
      <div className="f-premium-strategy">
        <ol className="f-premium-strategy__axes">
          {strategyAxes.map((item, index) => (
            <li key={item.axis} data-reveal-item data-reveal-order={index + 4}>
              <span>{item.axis}</span><strong>{item.label}</strong><p>{item.note}</p>
            </li>
          ))}
        </ol>
        <div className="f-premium-strategy__grid" aria-label="전략형 9개 프리뷰 샘플" data-reveal-item data-reveal-order="7">
          {previewCells.map(([axis, image, lifestyle], index) => (
            <article key={`${axis}-${image}-${lifestyle}`}>
              <Image src={`/hero/demo/grid/female-v2-${String(index + 1).padStart(2, "0")}.webp`} alt={`${axis} 전략 프리뷰 ${index + 1}`} fill sizes="(max-width: 640px) 30vw, 15vw" />
              <span>{axis}</span>
            </article>
          ))}
        </div>
      </div>
    </LandingScene>
  );
}

export function CompareDecisionShowcase() {
  return (
    <LandingScene id="compare-decision" number="05" layout="editorial-split">
      <div className="f-premium-split f-premium-split--reverse">
        <div>
          <SceneHeader
            eyebrow="Compare & Decision"
            title="같은 구도에서 비교하고, 결정의 이유까지 남깁니다."
            description="shortlist 후보를 동일 crop으로 비교한 뒤 최종 선택을 확정합니다. 확정 기록은 이후 브리프와 패션 방향의 기준이 됩니다."
          />
          <ul className="f-premium-checklist" data-reveal-item data-reveal-order="4">
            <li><Check aria-hidden="true" /> 동일 crop 비교</li>
            <li><Check aria-hidden="true" /> 후보 shortlist</li>
            <li><LockKeyhole aria-hidden="true" /> 변경 불가 Decision 기록</li>
          </ul>
        </div>
        <div className="f-premium-compare" data-reveal-item data-reveal-order="5">
          {["03", "05"].map((id, index) => (
            <figure key={id}>
              <Image src={`/hero/demo/grid/female-v2-${id}.webp`} alt={`동일 구도 비교 후보 ${index + 1}`} fill sizes="(max-width: 840px) 45vw, 25vw" />
              <figcaption>{index === 0 ? "SHORTLIST 01" : "FINAL DECISION"}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </LandingScene>
  );
}

export function SalonBriefShowcase() {
  return (
    <LandingScene id="salon-brief" number="06" layout="editorial-split" tone="inverse">
      <div className="f-premium-split">
        <div className="f-premium-media" data-landing-media data-detail-closeup data-reveal-item data-reveal-order="1">
          <Image src="/landing/editorial/salon-consultation-tablet-chair.webp" alt="미용실에서 태블릿의 상담 브리프를 함께 확인하는 고객과 디자이너" fill sizes="(max-width: 840px) 92vw, 50vw" />
        </div>
        <div>
          <SceneHeader eyebrow="Salon Brief" title="이미지를, 시술 가능한 대화로 바꿉니다." description="최종 결정과 사용자 제약을 길이·볼륨·질감·피해야 할 요소로 정리해 디자이너와 같은 기준으로 상담할 수 있습니다." />
          <div className="f-premium-brief" data-reveal-item data-reveal-order="4">
            <p><span>TARGET</span> 쇄골 위 2cm · 관자 볼륨 절제</p>
            <p><span>TEXTURE</span> 자연스러운 C컬 · 과한 고정 금지</p>
            <p><span>AVOID</span> 짧은 앞머리 · 강한 컬</p>
          </div>
        </div>
      </div>
    </LandingScene>
  );
}

export function AftercareTimelineShowcase() {
  return (
    <LandingScene id="aftercare" number="07" layout="typographic-index" tone="quiet">
      <SceneHeader eyebrow="Aftercare" title="시술이 끝난 뒤에, 관리가 시작됩니다." description="애프터케어는 실제 시술 완료 후 열립니다. 시술 정보와 관리 주기를 기준으로 오늘 해야 할 일을 과도한 단계 없이 이어갑니다." />
      <ol className="f-premium-timeline">
        {[
          ["SERVICE DAY", "시술 결과와 주의사항 기록"],
          ["DAY 03", "세정·건조 루틴 확인"],
          ["WEEK 02", "볼륨과 컬 유지 상태 점검"],
          ["WEEK 08", "다음 관리 시점 제안"],
        ].map(([time, task], index) => <li key={time} data-reveal-item data-reveal-order={index + 4}><Clock3 aria-hidden="true" /><span>{time}</span><strong>{task}</strong></li>)}
      </ol>
    </LandingScene>
  );
}

export function FashionDirectionShowcase() {
  return (
    <LandingScene id="fashion-direction" number="08" layout="editorial-split">
      <div className="f-premium-split f-premium-split--reverse">
        <div>
          <SceneHeader eyebrow="Fashion Direction" title="확정한 헤어의 인상을, 9개의 패션 방향으로 확장합니다." description="헤어 결정과 상황·무드·체형 입력을 하나의 배치로 연결합니다. 슬롯마다 반복 요청하는 마법사 흐름이 아닙니다." />
          <div className="f-premium-batch" data-reveal-item data-reveal-order="4"><Sparkles aria-hidden="true" /><span>9-LOOK BATCH</span><strong>Work · Weekend · Occasion</strong></div>
        </div>
        <div className="f-premium-fashion-grid" aria-label="패션 9-look 배치 샘플" data-reveal-item data-reveal-order="5">
          {["female-short-soft-v3.webp", "female-medium-work-v3.webp", "female-long-date-v3.webp"].map((asset, index) => (
            <figure key={asset}><Image src={`/hero/fashion-demo/${asset}`} alt={`확정 헤어와 연결된 패션 방향 ${index + 1}`} fill sizes="(max-width: 840px) 30vw, 16vw" /></figure>
          ))}
        </div>
      </div>
    </LandingScene>
  );
}

export function StyleDossierShowcase() {
  return (
    <LandingScene id="style-dossier" number="09" layout="closing-stage" tone="inverse">
      <div className="f-premium-dossier">
        <div>
          <SceneHeader eyebrow="Style Dossier · Sample" title="한 번의 생성이 아니라, 결정의 맥락을 남깁니다." description="현재 컨설팅에서 이어지는 분석·전략·결정·브리프·관리 데이터를 하나의 샘플 Dossier로 보여드립니다." />
          <Link href="/consulting/new" className="f-landing-cta f-landing-cta--inverse" data-reveal-item data-reveal-order="4">프라이빗 컨설팅 시작 <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
        </div>
        <div className="f-premium-dossier__sheet" data-reveal-item data-reveal-order="5">
          <p>HAIRFIT / PRIVATE STYLE DIRECTION</p>
          <h3>STYLE DOSSIER 01</h3>
          <section><span className="f-premium-status f-premium-status--current">현재 제공</span><ul>{dossierCurrent.map((item) => <li key={item}>{item}</li>)}</ul></section>
          <section><span className="f-premium-status f-premium-status--planned">예정 기능</span><ul>{dossierPlanned.map((item) => <li key={item}>{item}</li>)}</ul></section>
        </div>
      </div>
    </LandingScene>
  );
}

export function TrustAndFinalCta({ faqs }: { faqs: Array<{ question: string; answer: string }> }) {
  return (
    <LandingScene id="trust" number="11" layout="closing-stage" tone="quiet">
      <div className="f-premium-trust">
        <SceneHeader eyebrow="Trust & Limits" title="결제보다 먼저, 데이터와 결과의 한계를 설명합니다." description="AI 결과는 가상 시뮬레이션이며 실제 시술 결과를 보장하지 않습니다. 사진과 공유 데이터의 처리 기준을 확인한 뒤 시작하세요." />
        <ul className="f-premium-trust__rails" data-reveal-item data-reveal-order="4">
          <li><ShieldCheck aria-hidden="true" /><strong>개인정보</strong><span>업로드·보관·삭제 기준을 서비스 안에서 안내</span></li>
          <li><Clock3 aria-hidden="true" /><strong>공유 제어</strong><span>공유 링크는 만료되며 폐기 상태를 확인</span></li>
          <li><Sparkles aria-hidden="true" /><strong>품질 회복</strong><span>품질 미달 결과는 상태에 따라 재처리</span></li>
        </ul>
        <div className="f-premium-faq" data-reveal-item data-reveal-order="5">
          {faqs.slice(0, 4).map((faq) => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}
        </div>
        <div className="f-premium-final" data-reveal-item data-reveal-order="6">
          <p>PRIVATE AI STYLE DIRECTION</p><h2>당신의 다음 스타일을, 더 정확한 기준으로 시작하세요.</h2>
          <div><Link href="/consulting/new" className="f-landing-cta">프라이빗 컨설팅 시작 <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link><Link href="/b2b/contact" className="f-landing-ghost-cta">살롱 도입 문의</Link></div>
        </div>
      </div>
    </LandingScene>
  );
}
