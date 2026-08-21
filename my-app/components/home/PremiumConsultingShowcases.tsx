import { ArrowRight, Check, Clock3, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { LandingScene, SceneHeader } from "./LandingScene";
import { FashionDirectionPreviewPanel, StrategicHairPreviewPanel } from "./PremiumAutoSwitchPreviewPanel";

const strategyAxes = [
  { axis: "BALANCE", label: "균형 보정", note: "관자 폭과 정수리 높이를 함께 조정" },
  { axis: "IMAGE", label: "인상 설계", note: "단정함을 유지하며 선을 부드럽게" },
  { axis: "LIFESTYLE", label: "생활 적합성", note: "아침 10분, 8주 관리 주기 기준" },
] as const;

const analysisLedger = [
  ["FACE MIX", "타원형 62% · 하트형 24%", "랜드마크 측정"],
  ["PROPORTION", "중안부 안정 · 하관선 완만", "AI 추정 + 비율선"],
  ["PERSONAL COLOR", "저채도 · 중명도 · 뉴트럴", "사진 기반 추정"],
  ["PHOTO QUALITY", "정면·조명·해상도 적합", "시스템 검증"],
] as const;

const directionRows = [
  ["LENGTH", "쇄골선 유지", "얼굴 세로선은 살리고 관리 부담은 제한"],
  ["BANGS / PART", "앞머리 없음 · 6:4", "이마 노출을 유지해 답답한 인상 방지"],
  ["VOLUME", "정수리 + · 관자 −", "상하 균형을 보정하고 옆 폭은 절제"],
  ["TEXTURE / COLOR", "소프트 C컬 · 뉴트럴 브라운", "아침 10분과 저채도 방향에 맞춤"],
] as const;

const compareRows = [
  ["얼굴 균형", "좋음", "매우 좋음", "보통"],
  ["원하는 인상", "차분함", "단정+부드러움", "선명함"],
  ["아침 손질", "8분", "10분", "15분"],
  ["필요 시술", "커트", "커트+C컬", "펌+컬러"],
  ["현재 모발 적합", "높음", "높음", "중간"],
  ["퍼스널 컬러", "적합", "매우 적합", "보정 필요"],
  ["관리 주기", "10주", "8주", "6주"],
  ["리스크", "볼륨 부족", "낮음", "손상·손질"],
] as const;

const salonBriefRows = [
  ["LENGTH", "쇄골 위 2cm, 젖은 상태에서 과도하게 짧지 않게"],
  ["BANGS / PART", "앞머리 없음, 자연스러운 6:4 가르마"],
  ["LAYERS", "턱선 아래부터 낮은 레이어, 끝선 밀도 유지"],
  ["VOLUME", "정수리 볼륨 확보, 관자와 옆선 부피 절제"],
  ["TEXTURE", "자연스러운 C컬, 굵고 느슨한 흐름"],
  ["COLOR", "저채도 뉴트럴 브라운, 얼굴 주변 과명도 금지"],
  ["SERVICE", "커트 우선, 모발 상태 확인 후 C컬 옵션"],
  ["AVOID", "짧은 앞머리, 강한 컬, 무거운 옆 볼륨"],
] as const;

const consultationContinuityProofs = [
  ["01", "8개 판단 기준", "균형·손질·시술·컬러·관리 주기·리스크를 같은 표에서 비교"],
  ["02", "살롱 전달", "확정한 길이·볼륨·질감과 피해야 할 요소를 시술 언어로 정리"],
  ["03", "시술 후 관리", "시술 기록이 등록되면 오늘 관리와 다음 방문 기준으로 연결"],
] as const;

const dossierPages = [
  ["01", "FACE PROFILE", "얼굴 혼합형·비율·랜드마크와 분석 신뢰도"],
  ["02", "HAIR DIRECTION", "길이·가르마·볼륨·질감의 확정 전략"],
  ["03", "DECISION", "후보 비교와 최종 선택, 선택하지 않은 이유"],
  ["04", "CARE PROTOCOL", "살롱 브리프·오늘의 관리·다음 방문 기준"],
] as const;

const dossierCurrent = [
  "분석 근거와 얼굴 랜드마크",
  "확정한 전략과 비교 후보",
  "선택 시점의 기준이 보존된 결정 기록",
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
          <div className="f-premium-evidence-ledger" data-reveal-item data-reveal-order="5">
            {analysisLedger.map(([label, value, source]) => (
              <article key={label}><span>{label}</span><strong>{value}</strong><small>{source}</small></article>
            ))}
          </div>
          <p className="f-premium-proof-note" data-reveal-item data-reveal-order="6">직접 측정·AI 추정·시스템 검증을 구분해 표시합니다. 값은 실제 V2 필드 구조를 설명하기 위한 개인정보 비식별 샘플입니다.</p>
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
      <div className="f-premium-direction-matrix" data-reveal-item data-reveal-order="5">
        <div className="f-premium-table-head"><span>STRATEGY FIELD</span><span>AI RECOMMENDATION</span><span>EVIDENCE & IMPACT</span></div>
        {directionRows.map(([field, decision, reason]) => <div key={field}><span>{field}</span><strong>{decision}</strong><p>{reason}</p></div>)}
      </div>
      <Link href="/consulting/new" className="f-landing-cta" data-reveal-item data-reveal-order="6">
        내 얼굴 분석부터 시작 <ArrowRight aria-hidden="true" className="h-4 w-4" />
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
        <div data-reveal-item data-reveal-order="7"><StrategicHairPreviewPanel /></div>
      </div>
    </LandingScene>
  );
}

export function CompareDecisionShowcase() {
  return (
    <LandingScene id="compare-decision" number="05" layout="editorial-split">
      <div className="f-premium-compare-layout">
        <div>
          <SceneHeader
            eyebrow="Compare & Decision"
            title="같은 구도에서 비교하고, 결정의 이유까지 남깁니다."
            description="최종 후보를 같은 구도로 비교한 뒤 선택을 확정합니다. 확정 기록은 이후 브리프와 패션 방향의 기준이 됩니다."
          />
          <ul className="f-premium-checklist" data-reveal-item data-reveal-order="4">
            <li><Check aria-hidden="true" /> 같은 구도 비교</li>
            <li><Check aria-hidden="true" /> 최종 후보 선정</li>
            <li><LockKeyhole aria-hidden="true" /> 선택 시점의 기준을 버전으로 보존</li>
          </ul>
        </div>
        <p className="f-premium-scroll-hint" id="compare-scroll-hint">후보 이미지와 비교표를 좌우로 밀어 모든 기준을 확인하세요.</p>
        <div className="f-premium-compare" data-reveal-item data-reveal-order="5" role="region" aria-label="동일 구도 후보 이미지 비교" aria-describedby="compare-scroll-hint" tabIndex={0}>
          {["03", "05", "07"].map((id, index) => (
            <figure key={id}>
              <Image src={`/hero/demo/grid/female-v2-${id}.webp`} alt={`동일 구도 비교 후보 ${index + 1}`} fill sizes="(max-width: 840px) 45vw, 25vw" />
              <figcaption>{index === 1 ? "최종 선택" : `후보 0${index + 1}`}</figcaption>
            </figure>
          ))}
        </div>
        <div className="f-premium-compare-matrix" data-reveal-item data-reveal-order="6" role="region" aria-label="후보별 8개 판단축 비교표" aria-describedby="compare-scroll-hint" tabIndex={0}>
          <div className="f-premium-compare-matrix__head"><span>판단 기준</span><span>A · 부드러움</span><span>B · 균형</span><span>C · 선명함</span></div>
          {compareRows.map(([axis, a, b, c]) => <div key={axis}><strong>{axis}</strong><span>{a}</span><span className="is-selected">{b}</span><span>{c}</span></div>)}
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
            <div className="f-premium-brief__meta"><span>SALON HANDOFF / SAMPLE</span><strong>결정 B · BALANCED</strong></div>
            {salonBriefRows.map(([label, value]) => <p key={label}><span>{label}</span>{value}</p>)}
            <div className="f-premium-brief__check"><Check aria-hidden="true" /><span>현장 확인</span><strong>두피·모발 손상도 확인 후 펌 강도 최종 조정</strong></div>
          </div>
          <div className="f-premium-proof-bridge" data-reveal-item data-reveal-order="5" aria-label="컨설팅 결과 연결 증거">
            <div className="f-premium-proof-bridge__intro">
              <span>DECISION TO ACTION</span>
              <strong>결과는 이미지에서 끝나지 않습니다.</strong>
              <p>선택한 이유와 제약이 브리프·관리·패션까지 같은 기준으로 이어집니다.</p>
            </div>
            <ol>
              {consultationContinuityProofs.map(([index, title, body]) => (
                <li key={index}><span>{index}</span><strong>{title}</strong><p>{body}</p></li>
              ))}
            </ol>
            <Link href="/consulting/new" className="f-landing-cta f-landing-cta--inverse">
              내 상담 브리프 준비 시작 <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
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
      <div className="f-premium-care-dashboard" data-reveal-item data-reveal-order="4">
        <article><span>TODAY</span><strong>컬을 당기지 말고 뿌리부터 80% 건조</strong><p>남은 시간 약 7분 · 필요한 도구: 드라이어, 큰 롤 브러시</p></article>
        <dl><div><dt>시술 등록</dt><dd>커트 + 소프트 C컬</dd></div><div><dt>현재 체크인</dt><dd>DAY 03 / 세정 가능</dd></div><div><dt>다음 기준</dt><dd>볼륨 유지와 끝선 건조도</dd></div></dl>
      </div>
      <ol className="f-premium-timeline">
        {[
          ["SERVICE DAY", "시술 결과와 주의사항 기록"],
          ["DAY 03", "세정·건조 루틴 확인"],
          ["WEEK 02", "볼륨과 컬 유지 상태 점검"],
          ["WEEK 08", "다음 관리 시점 제안"],
        ].map(([time, task], index) => <li key={time} data-reveal-item data-reveal-order={index + 5}><Clock3 aria-hidden="true" /><span>{time}</span><strong>{task}</strong><small>{index === 0 ? "완료" : index === 1 ? "오늘" : "예정"}</small></li>)}
      </ol>
    </LandingScene>
  );
}

export function FashionDirectionShowcase() {
  return (
    <LandingScene id="fashion-direction" number="08" layout="editorial-split">
      <div className="f-premium-split f-premium-split--reverse">
        <div>
          <SceneHeader eyebrow="Fashion Direction" title="확정한 헤어의 인상을, 9개의 패션 방향으로 확장합니다." description="헤어 결정과 상황·무드·체형을 한 번 연결해 Work·Weekend·Occasion 9개 룩을 한 화면에서 비교합니다." />
          <div className="f-premium-batch" data-reveal-item data-reveal-order="4"><Sparkles aria-hidden="true" /><span>9-LOOK BATCH</span><strong>Work · Weekend · Occasion</strong></div>
          <dl className="f-premium-fashion-brief" data-reveal-item data-reveal-order="5">
            <div><dt>PALETTE</dt><dd>뉴트럴 베이지 · 잉크 네이비 · 더스티 로즈</dd></div>
            <div><dt>NECKLINE</dt><dd>열린 칼라와 부드러운 V선으로 얼굴선 연장</dd></div>
            <div><dt>SILHOUETTE</dt><dd>상체는 정돈하고 하단에 자연스러운 움직임</dd></div>
            <div><dt>AVOID</dt><dd>얼굴 가까운 고채도 오렌지 · 답답한 하이넥</dd></div>
          </dl>
        </div>
        <div data-reveal-item data-reveal-order="6"><FashionDirectionPreviewPanel /></div>
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
          <Link href="/consulting/new" className="f-landing-cta f-landing-cta--inverse" data-reveal-item data-reveal-order="4">내 스타일 기록 시작 <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
        </div>
        <div className="f-premium-dossier__sheet" data-reveal-item data-reveal-order="5">
          <p>HAIRFIT / PRIVATE STYLE DIRECTION</p>
          <h3>STYLE DOSSIER 01</h3>
          <span className="f-premium-status f-premium-status--current">현재 제공</span>
          <div className="f-premium-dossier__pages">
            {dossierPages.map(([page, title, body]) => <article key={page}><span>{page}</span><strong>{title}</strong><p>{body}</p></article>)}
          </div>
          <section><strong>연결된 기록</strong><ul>{dossierCurrent.map((item) => <li key={item}>{item}</li>)}</ul></section>
          <section><span className="f-premium-status f-premium-status--planned">예정 기능</span><ul>{dossierPlanned.map((item) => <li key={item}>{item}</li>)}</ul></section>
        </div>
      </div>
    </LandingScene>
  );
}

export function TrustShowcase({ faqs }: { faqs: Array<{ question: string; answer: string }> }) {
  return (
    <LandingScene id="trust" number="10" layout="closing-stage" tone="quiet">
      <div className="f-premium-trust">
        <SceneHeader eyebrow="Trust & Limits" title="시작하기 전에, 데이터와 결과의 한계를 확인하세요." description="AI 결과는 가상 시뮬레이션이며 실제 시술 결과를 보장하지 않습니다. 사진의 업로드·보관·삭제와 공유 범위를 확인한 뒤 진행할 수 있습니다." />
        <ul className="f-premium-trust__rails" data-reveal-item data-reveal-order="4">
          <li><ShieldCheck aria-hidden="true" /><strong>개인정보</strong><span>업로드·보관·삭제 기준을 서비스 안에서 안내</span></li>
          <li><Clock3 aria-hidden="true" /><strong>공유 제어</strong><span>공유 링크는 만료되며 폐기 상태를 확인</span></li>
          <li><Sparkles aria-hidden="true" /><strong>품질 회복</strong><span>품질 미달 결과는 상태에 따라 재처리</span></li>
        </ul>
        <div className="f-premium-faq" data-reveal-item data-reveal-order="5">
          {faqs.slice(0, 4).map((faq) => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}
        </div>
      </div>
    </LandingScene>
  );
}
