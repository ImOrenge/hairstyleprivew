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

const decisionEvidenceRows = [
  ["얼굴 균형", "관자 폭과 정수리 높이", "쇄골선 · 정수리 볼륨", "옆 폭을 줄이고 상하 균형을 살림"],
  ["얼굴 비율", "중안부 안정 · 하관선 완만", "앞머리 없음 · 6:4", "얼굴 세로선을 답답하지 않게 유지"],
  ["원하는 인상", "단정함 · 부드러운 변화", "낮은 레이어 · 소프트 C컬", "선명한 대비 없이 정돈된 인상 연결"],
  ["생활 조건", "아침 손질 10분", "말리기 쉬운 자연스러운 흐름", "반복 가능한 관리 난이도로 제한"],
  ["현재 모발 적합", "끝선 밀도와 손상 가능성", "커트 우선 · C컬 선택", "불필요한 고강도 시술을 피함"],
  ["퍼스널 컬러", "저채도 · 중명도 · 뉴트럴", "뉴트럴 브라운", "얼굴 가까운 색의 과한 대비를 줄임"],
  ["살롱 구현", "길이·가르마·볼륨 명세", "현장에서 재현 가능한 조합", "Salon Brief로 그대로 전달 가능"],
  ["피해야 할 요소", "짧은 앞머리 · 강한 컬 · 무거운 옆 볼륨", "해당 요소 제외", "분석 근거와 충돌하는 결과를 배제"],
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

const makeupPalette = {
  recommended: [
    ["SOFT BEIGE", "부드러운 뉴트럴 베이지", "soft-beige"],
    ["MUTED ROSE", "채도를 낮춘 로즈", "muted-rose"],
    ["COCOA BROWN", "붉지 않은 코코아 브라운", "cocoa-brown"],
  ],
  avoid: [
    ["VIVID ORANGE", "얼굴 가까운 고채도 오렌지", "vivid-orange"],
    ["ICY PINK", "푸른 기가 강한 아이시 핑크", "icy-pink"],
  ],
} as const;

const makeupZones = [
  ["EYES", "코코아 브라운으로 음영", "헤어의 부드러운 C컬과 연결하되 경계를 진하게 닫지 않습니다."],
  ["CHEEKS", "뮤트 로즈를 얇게", "광대 중심보다 바깥쪽으로 연결해 얼굴선의 흐름을 살립니다."],
  ["LIPS", "로즈 베이지로 마무리", "추천 팔레트 안에서 입술 중심만 한 단계 선명하게 정리합니다."],
] as const;

const makeupRoutine = [
  ["01", "베이스", "얇게 정돈하고 붉은 부위만 필요한 만큼 보정"],
  ["02", "눈·눈썹", "코코아 브라운으로 결을 살리고 경계는 부드럽게"],
  ["03", "볼·입술", "뮤트 로즈와 로즈 베이지를 같은 채도 안에서 연결"],
] as const;

const consultationContinuityProofs = [
  ["01", "8개 판단 기준", "균형·손질·시술·컬러·관리 주기·리스크를 AI 선정 근거로 설명"],
  ["02", "살롱 전달", "확정한 길이·볼륨·질감과 피해야 할 요소를 시술 언어로 정리"],
  ["03", "시술 후 관리", "시술 기록이 등록되면 오늘 관리와 다음 방문 기준으로 연결"],
] as const;

const dossierPages = [
  ["01", "FACE PROFILE", "얼굴 혼합형·비율·랜드마크와 분석 신뢰도"],
  ["02", "HAIR DIRECTION", "길이·가르마·볼륨·질감의 확정 전략"],
  ["03", "DECISION", "AI 최종 헤어 1개와 얼굴·모발·생활 조건에 따른 선정 근거"],
  ["04", "MAKEUP & FASHION", "메이크업 전문 리포트·루틴과 패션 방향"],
  ["05", "CARE PROTOCOL", "살롱 브리프·관리 안내·AI 사후상담 기준"],
] as const;

const dossierCurrent = [
  "분석 근거와 얼굴 랜드마크",
  "AI가 확정한 헤어와 판단 근거",
  "선택 시점의 기준이 보존된 결정 기록",
  "살롱 브리프와 시술 후 애프터케어",
  "메이크업 전문 리포트·셀프 루틴·아티스트 브리프",
  "패션 9-look 방향",
] as const;

const dossierPlanned = ["PDF 내보내기", "연간 Style Archive", "전문가 검수 리포트"] as const;

export function AnalysisEvidenceShowcase() {
  return (
    <LandingScene id="analysis-evidence" number="01" layout="editorial-split" tone="quiet">
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
            title="헤어보다 먼저, 나에게 편안한 색의 기준을 찾습니다."
            description="사진 품질과 얼굴 균형을 확인하고 퍼스널 컬러의 명도·채도·온도 근거를 연결합니다. 추천 팔레트와 피하면 좋은 색을 함께 보여드리며, 사진 진단의 한계도 숨기지 않습니다."
          />
          <dl className="f-premium-metrics" data-reveal-item data-reveal-order="4">
            <div><dt>FACE BALANCE</dt><dd>세로 비율 안정 · 관자 폭 보정 필요</dd></div>
            <div><dt>PERSONAL COLOR</dt><dd>저채도 · 중명도 · 뉴트럴 추천 / 고채도 오렌지 주의</dd></div>
            <div><dt>EVIDENCE STATUS</dt><dd><ShieldCheck aria-hidden="true" /> 분석 근거 연결됨</dd></div>
          </dl>
          <div className="f-premium-evidence-ledger" data-reveal-item data-reveal-order="5">
            {analysisLedger.map(([label, value, source]) => (
              <article key={label}><span>{label}</span><strong>{value}</strong><small>{source}</small></article>
            ))}
          </div>
          <p className="f-premium-proof-note" data-reveal-item data-reveal-order="6">무료 진단은 사진 기반 간이 결과입니다. 조명·카메라 색감에 영향을 받을 수 있으며, 보조 사진과 드레이프를 쓰는 정밀 진단은 유료 풀코스에서 제공합니다.</p>
        </div>
      </div>
    </LandingScene>
  );
}

export function DirectionShowcase() {
  return (
    <LandingScene id="user-direction" number="02" layout="typographic-index">
      <SceneHeader
        eyebrow="User Direction"
        title="AI가 먼저 제안하고, 원하는 방향은 선택해서 더합니다."
        description="아무것도 입력하지 않아도 AI가 사진을 보고 시작합니다. 원하는 변화나 추가 고려사항이 있다면 선택 항목과 자유 메모로 더할 수 있으며 필수 질문은 없습니다."
      />
      <div className="f-premium-direction" data-reveal-item data-reveal-order="4">
        <div className="f-premium-direction__input">
          <span>OPTIONAL INPUT</span>
          <strong>자연스러운 변화 · 아침 10분 · 안경 고려</strong>
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
      <Link href="/consulting/new" prefetch={false} className="f-landing-cta" data-reveal-item data-reveal-order="6">
        내 얼굴 분석부터 시작 <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </LandingScene>
  );
}

export function StrategicPreviewShowcase() {
  return (
    <LandingScene id="strategic-preview" number="03" layout="sticky-stage" motion="scroll-progress" tone="quiet">
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
    <LandingScene id="compare-decision" number="04" layout="editorial-split">
      <div className="f-premium-compare-layout">
        <div>
          <SceneHeader
            eyebrow="AI Decision Evidence"
            title="AI가 가장 맞는 헤어 1개를 확정하고, 이유를 설명합니다."
            description="AI가 생성 결과 9개를 얼굴 균형·현재 모발·퍼스널 컬러·원하는 인상·생활 조건과 함께 검토합니다. 최종 헤어는 정확히 1개만 확정하며, 고객은 선정 근거와 피한 요소를 확인할 수 있습니다."
          />
          <ul className="f-premium-checklist" data-reveal-item data-reveal-order="4">
            <li><Check aria-hidden="true" /> AI 최종 헤어 1개 확정</li>
            <li><Check aria-hidden="true" /> 8개 판단 기준과 선정 이유 공개</li>
            <li><LockKeyhole aria-hidden="true" /> 확정 시점의 근거와 결과 보존</li>
          </ul>
        </div>
        <p className="f-premium-scroll-hint" id="compare-scroll-hint">AI 판단 근거표를 좌우로 밀어 모든 기준을 확인하세요.</p>
        <div className="f-premium-compare f-premium-compare--single" data-reveal-item data-reveal-order="5" role="region" aria-label="AI가 최종 확정한 헤어 예시" aria-describedby="compare-scroll-hint" tabIndex={0}>
          <figure>
            <Image src="/hero/demo/grid/female-v2-05.webp" alt="AI가 얼굴·모발·퍼스널 컬러 근거로 최종 확정한 헤어 예시" fill sizes="(max-width: 840px) 92vw, 54vw" />
            <figcaption>AI FINAL · 01</figcaption>
          </figure>
        </div>
        <div className="f-premium-compare-matrix" data-reveal-item data-reveal-order="6" role="region" aria-label="AI 최종 헤어 8개 판단 근거" aria-describedby="compare-scroll-hint" tabIndex={0}>
          <div className="f-premium-compare-matrix__head"><span>판단 기준</span><span>확인한 정보</span><span>AI 결론</span><span>선정 이유</span></div>
          {decisionEvidenceRows.map(([axis, evidence, conclusion, reason]) => <div key={axis}><strong>{axis}</strong><span>{evidence}</span><span className="is-selected">{conclusion}</span><span>{reason}</span></div>)}
        </div>
      </div>
    </LandingScene>
  );
}

export function SalonBriefShowcase() {
  return (
    <LandingScene id="salon-brief" number="05" layout="editorial-split" tone="inverse">
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
            <Link href="/consulting/new" prefetch={false} className="f-landing-cta f-landing-cta--inverse">
              내 상담 브리프 준비 시작 <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </LandingScene>
  );
}

export function MakeupDirectionShowcase() {
  return (
    <LandingScene id="makeup-direction" number="06" layout="editorial-split" tone="quiet">
      <div className="f-premium-makeup">
        <div>
          <SceneHeader
            eyebrow="Personal Color Makeup Direction"
            title="퍼스널 컬러를 메이크업 방향으로 연결합니다"
            description="사진 기반 컬러 근거와 확정한 헤어, 원하는 인상을 함께 보고 눈·볼·입술의 방향을 정합니다. 고객용 AI 전문 해설과 셀프 루틴, 아티스트에게 전달할 부위별 명세까지 같은 결과로 이어집니다."
          />
          <div className="f-premium-makeup__palette" data-reveal-item data-reveal-order="4">
            <section aria-labelledby="makeup-palette-recommended">
              <p id="makeup-palette-recommended">추천 팔레트</p>
              <ul>
                {makeupPalette.recommended.map(([code, label, token]) => (
                  <li key={code}><span data-makeup-swatch={token} aria-hidden="true" /><strong>{code}</strong><small>{label}</small></li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="makeup-palette-avoid">
              <p id="makeup-palette-avoid">피하면 좋은 색</p>
              <ul>
                {makeupPalette.avoid.map(([code, label, token]) => (
                  <li key={code}><span data-makeup-swatch={token} aria-hidden="true" /><strong>{code}</strong><small>{label}</small></li>
                ))}
              </ul>
            </section>
          </div>
          <p className="f-premium-proof-note" data-reveal-item data-reveal-order="5">제품 작성 예시이며 실제 고객의 전후 사진이 아닙니다. 사진의 조명·화이트밸런스와 피부 표현에 따라 실제 발색은 달라질 수 있습니다.</p>
        </div>

        <div className="f-premium-makeup__report" data-reveal-item data-reveal-order="6">
          <div className="f-premium-makeup__report-head">
            <span>AI 메이크업 디렉터 리포트 · 예시</span>
            <strong>저채도 뉴트럴 팔레트로 헤어의 부드러운 흐름을 이어갑니다.</strong>
            <p>색을 많이 더하기보다 눈매와 입술의 경계를 정돈하면 확정 헤어의 차분한 인상과 자연스럽게 연결됩니다.</p>
          </div>
          <dl className="f-premium-makeup__zones">
            {makeupZones.map(([zone, direction, reason]) => <div key={zone}><dt>{zone}</dt><dd><strong>{direction}</strong><span>{reason}</span></dd></div>)}
          </dl>
          <ol className="f-premium-makeup__routine" aria-label="셀프 메이크업 적용 순서">
            {makeupRoutine.map(([step, title, body]) => <li key={step}><span>{step}</span><strong>{title}</strong><p>{body}</p></li>)}
          </ol>
          <div className="f-premium-makeup__artist-brief">
            <span>ARTIST BRIEF</span>
            <p>눈·볼·입술의 정확한 컬러·강도·위치는 AI가 다시 쓰지 않고 확정된 전문가 명세를 그대로 전달합니다.</p>
          </div>
          <div className="f-premium-makeup__actions">
            <Link href="/consulting/new" prefetch={false} className="f-landing-cta">내 메이크업 방향 확인 <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
            <Link href="/discover/personal-color-makeup" className="f-landing-ghost-cta">퍼스널 컬러 메이크업 가이드</Link>
          </div>
        </div>
      </div>
    </LandingScene>
  );
}

export function AftercareTimelineShowcase() {
  return (
    <LandingScene id="aftercare" number="09" layout="typographic-index" tone="quiet">
      <SceneHeader eyebrow="Aftercare" title="시술이 끝난 뒤에, 관리가 시작됩니다." description="시술 정보가 등록되면 D+1·3·7·30·45·90에 관리 안내를 제공합니다. 사진과 고민을 바탕으로 답변하는 AI 사후상담은 플랜에 따라 별도로 열립니다." />
      <div className="f-premium-care-dashboard" data-reveal-item data-reveal-order="4">
        <article><span>TODAY</span><strong>컬을 당기지 말고 뿌리부터 80% 건조</strong><p>남은 시간 약 7분 · 필요한 도구: 드라이어, 큰 롤 브러시</p></article>
        <dl><div><dt>관리 안내</dt><dd>D+1·3·7·30·45·90, 총 6회</dd></div><div><dt>현재 안내</dt><dd>D+3 / 세정·건조 루틴 확인</dd></div><div><dt>AI 사후상담</dt><dd>플랜별 D+30 또는 D+30·60·90</dd></div></dl>
      </div>
      <ol className="f-premium-timeline">
        {[
          ["D+1", "시술 직후 주의사항과 첫 세정 전 관리"],
          ["D+3", "세정·건조 루틴 확인"],
          ["D+7", "컬·볼륨과 불편 신호 확인"],
          ["D+30", "유지 상태 점검 · AI 사후상담 가능 시점"],
          ["D+45", "손질 변화와 다음 관리 준비"],
          ["D+90", "장기 유지와 다음 상담 기준 정리"],
        ].map(([time, task], index) => <li key={time} data-reveal-item data-reveal-order={index + 5}><Clock3 aria-hidden="true" /><span>{time}</span><strong>{task}</strong><small>{index < 2 ? "초기 관리" : "예정"}</small></li>)}
      </ol>
      <div className="f-premium-aftercare-entitlements" data-reveal-item data-reveal-order="11">
        <p><strong>1회 플랜</strong><span>AI 사후상담 D+30 · 1회</span></p>
        <p><strong>3개월 플랜</strong><span>상담당 D+30·60·90 · 3회</span></p>
        <p><strong>연간 플랜</strong><span>연 4개 상담 각각 D+30·60·90 · 상담당 3회</span></p>
      </div>
    </LandingScene>
  );
}

export function FashionDirectionShowcase() {
  return (
    <LandingScene id="fashion-direction" number="07" layout="editorial-split">
      <div className="f-premium-split f-premium-split--reverse">
        <div>
          <SceneHeader eyebrow="Fashion Direction" title="기본 3개를 지키면서, 최대 6개를 더 만듭니다." description="먼저 Work·Weekend·Occasion 기본 3개를 확인합니다. 원하면 기존 결과를 교체하지 않고 3개씩 두 번 추가해 최대 9개까지 비교할 수 있습니다." />
          <div className="f-premium-batch" data-reveal-item data-reveal-order="4"><Sparkles aria-hidden="true" /><span>3 + 3 + 3</span><strong>기본 3개 · 최대 6개 추가 생성</strong></div>
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
    <LandingScene id="style-dossier" number="08" layout="closing-stage" tone="inverse">
      <div className="f-premium-dossier">
        <div>
          <SceneHeader eyebrow="Style Dossier · Sample" title="한 번의 생성이 아니라, 결정의 맥락을 남깁니다." description="현재 컨설팅에서 이어지는 분석·전략·결정·브리프·관리 데이터를 하나의 샘플 Dossier로 보여드립니다." />
          <Link href="/consulting/new" prefetch={false} className="f-landing-cta f-landing-cta--inverse" data-reveal-item data-reveal-order="4">내 스타일 기록 시작 <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
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
