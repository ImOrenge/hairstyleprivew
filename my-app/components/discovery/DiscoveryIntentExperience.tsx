import type { DiscoveryPageDefinition } from "@/lib/discovery/types";
import styles from "./DiscoveryPage.module.css";

export function DiscoveryIntentExperience({ definition }: { definition: DiscoveryPageDefinition }) {
  switch (definition.id) {
    case "D-AI-SIM":
      return <SimulationDecisionLab />;
    case "D-FACE":
      return <FaceLineFieldGuide />;
    case "D-MEN":
      return <MenGroomingPlanner />;
    case "D-WOMEN":
      return <WomenLengthPlanner />;
    case "D-BANGS":
      return <BangsRiskPlanner />;
    case "D-MAKEUP":
      return <MakeupDirectionPlanner />;
    case "D-SALON":
      return <SalonBriefBuilder />;
  }
}

function IntentHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header className={styles.intentHeader}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2>{title}</h2>
      <p>{description}</p>
    </header>
  );
}

function SimulationDecisionLab() {
  return (
    <div className={styles.intentExperience} data-intent-experience="simulation-decision-lab">
      <section className={styles.intentSection} aria-labelledby="simulation-score-title">
        <IntentHeader
          eyebrow="CANDIDATE SCORECARD"
          title="예쁜 한 장보다, 남길 이유가 있는 세 장"
          description="각 후보를 같은 세 질문으로 평가하면 분위기에 끌려 무작위로 고르는 일을 줄일 수 있습니다."
        />
        <div className={styles.scorecardTable} role="table" aria-label="AI 헤어 후보 선택 점수표">
          <div className={styles.scorecardRow} role="row">
            <strong role="columnheader">평가 질문</strong><strong role="columnheader">확인 기준</strong><strong role="columnheader">탈락 신호</strong>
          </div>
          <div className={styles.scorecardRow} role="row">
            <span role="cell">원하는 인상인가?</span><span role="cell">차분함·선명함·부드러움 중 하나로 설명</span><span role="cell">“그냥 예뻐 보여서”만 남음</span>
          </div>
          <div className={styles.scorecardRow} role="row">
            <span role="cell">현재 길이에서 가능한가?</span><span role="cell">끝선과 레이어 변화 폭을 확인</span><span role="cell">기장·손상도 확인이 필요함</span>
          </div>
          <div className={styles.scorecardRow} role="row">
            <span role="cell">매일 관리할 수 있는가?</span><span role="cell">드라이·열기구·제품 사용 시간을 기록</span><span role="cell">평소 루틴보다 손질 단계가 많음</span>
          </div>
        </div>
      </section>
      <section className={`${styles.intentSection} ${styles.intentSectionQuiet}`} aria-labelledby="simulation-shortlist-title">
        <IntentHeader
          eyebrow="SHORTLIST RULE"
          title="서로 비슷한 세 장이 아니라, 선택 이유가 다른 세 장"
          description="최종 후보는 같은 스타일의 미세 변형보다 서로 다른 결정을 대표해야 상담에서 비교가 됩니다."
        />
        <ol className={styles.decisionSteps}>
          <li><span>01</span><div><h3>안전한 기준</h3><p>현재 모습에서 가장 적게 바뀌는 후보를 남깁니다.</p></div></li>
          <li><span>02</span><div><h3>원하는 변화</h3><p>인상이나 길이 변화가 가장 선명한 후보를 남깁니다.</p></div></li>
          <li><span>03</span><div><h3>현실적인 대안</h3><p>손질 시간과 시술 범위를 고려한 중간 후보를 남깁니다.</p></div></li>
        </ol>
      </section>
    </div>
  );
}

function FaceLineFieldGuide() {
  const observations = [
    ["이마", "앞머리와 가르마", "얼마나 열지", "카메라 각도와 눈썹 움직임"],
    ["광대", "옆 볼륨 시작점", "감쌀지 드러낼지", "렌즈와 고개 방향"],
    ["턱선", "끝선 위치", "위·아래 어디서 끊을지", "목 길이와 모발 수축"],
    ["세로 흐름", "정수리와 긴 레이어", "늘일지 분산할지", "표정과 촬영 거리"],
  ];
  return (
    <div className={styles.intentExperience} data-intent-experience="face-line-field-guide">
      <section className={styles.intentSection} aria-labelledby="face-observation-title">
        <IntentHeader eyebrow="READ THE LINES" title="얼굴형 이름 대신, 네 줄의 관찰 기록" description="둥근형·긴형 같은 한 단어를 붙이기 전에 무엇을 보고 어떤 헤어 요소를 바꿀지 분리합니다." />
        <div className={styles.axisLedger}>
          <div className={styles.axisLedgerHead}><span>관찰 부위</span><span>헤어 조절점</span><span>결정 질문</span><span>주의할 왜곡</span></div>
          {observations.map(([area, control, question, caution]) => (
            <div className={styles.axisLedgerRow} key={area}>
              <strong>{area}</strong><span>{control}</span><span>{question}</span><small>{caution}</small>
            </div>
          ))}
        </div>
      </section>
      <section className={`${styles.intentSection} ${styles.intentSectionQuiet}`} aria-labelledby="face-scenario-title">
        <IntentHeader eyebrow="SILHOUETTE PAIRING" title="관찰 뒤에는 반드시 두 후보를 짝지어 봅니다" description="한 후보만 보면 스타일의 효과를 얼굴형 때문이라고 오해하기 쉽습니다. 한 축만 바꾼 대조군을 둡니다." />
        <div className={styles.scenarioGrid}>
          <article><p>턱선이 신경 쓰일 때</p><h3>턱 위 보브 ↔ 턱 아래 보브</h3><span>끝선 위치만 바꿔 윤곽 차이를 확인</span></article>
          <article><p>이마 노출이 고민일 때</p><h3>오픈 파트 ↔ 소프트 프린지</h3><span>길이는 유지하고 앞머리만 비교</span></article>
          <article><p>세로 인상이 고민일 때</p><h3>정수리 볼륨 ↔ 옆 볼륨</h3><span>볼륨의 위치만 바꿔 흐름을 확인</span></article>
        </div>
      </section>
    </div>
  );
}

function MenGroomingPlanner() {
  return (
    <div className={styles.intentExperience} data-intent-experience="men-grooming-planner">
      <section className={styles.intentSection} aria-labelledby="men-routine-title">
        <IntentHeader eyebrow="MORNING ROUTINE" title="스타일 이름보다 먼저 정하는 아침 손질 시간" description="같은 가르마도 드라이 방향, 제품과 커트 주기가 다르면 유지 난이도가 크게 달라집니다." />
        <div className={styles.routinePlanner}>
          <article><strong>3분</strong><h3>말리고 정리</h3><p>짧은 크롭·낮은 볼륨</p><dl><div><dt>도구</dt><dd>드라이어</dd></div><div><dt>제품</dt><dd>선택</dd></div><div><dt>다듬기</dt><dd>3~4주</dd></div></dl></article>
          <article><strong>7분</strong><h3>가르마 만들기</h3><p>사이드·센터 파트</p><dl><div><dt>도구</dt><dd>드라이어·빗</dd></div><div><dt>제품</dt><dd>가벼운 크림</dd></div><div><dt>다듬기</dt><dd>4~6주</dd></div></dl></article>
          <article><strong>12분+</strong><h3>질감과 컬 조절</h3><p>중간 길이·웨이브</p><dl><div><dt>도구</dt><dd>드라이어·열기구</dd></div><div><dt>제품</dt><dd>컬·고정 제품</dd></div><div><dt>다듬기</dt><dd>6~8주</dd></div></dl></article>
        </div>
      </section>
      <section className={`${styles.intentSection} ${styles.intentSectionQuiet}`} aria-labelledby="barber-brief-title">
        <IntentHeader eyebrow="BARBER BRIEF" title="사진을 보여준 뒤, 이 네 문장을 덧붙이세요" description="이름이 같은 커트도 옆선과 앞머리, 볼륨 요구가 다르면 결과가 달라집니다." />
        <div className={styles.briefScript}>
          <p><span>01</span>옆머리는 <strong>귀를 덮을지 / 드러낼지</strong> 정하고 싶어요.</p>
          <p><span>02</span>앞머리는 <strong>내릴지 / 넘길지</strong> 두 후보로 보고 싶어요.</p>
          <p><span>03</span>정수리 볼륨은 <strong>매일 드라이 가능한 범위</strong>로 맞춰 주세요.</p>
          <p><span>04</span>다음 커트까지 <strong>몇 주 유지되는지</strong> 알려 주세요.</p>
        </div>
      </section>
    </div>
  );
}

function WomenLengthPlanner() {
  return (
    <div className={styles.intentExperience} data-intent-experience="women-length-planner">
      <section className={styles.intentSection} aria-labelledby="women-length-cost-title">
        <IntentHeader eyebrow="LENGTH COST" title="길이가 바꾸는 것은 인상보다 생활 조건입니다" description="묶임, 건조 시간, 다듬는 주기를 먼저 비교하면 단발·미디엄·롱의 선택이 구체적이 됩니다." />
        <div className={styles.lengthLedger}>
          <article><span>BOB</span><h3>턱선 전후</h3><ul><li>묶임이 제한적</li><li>끝선이 선명함</li><li>다듬는 주기가 짧음</li></ul><strong>큰 변화 · 짧은 유지 주기</strong></article>
          <article><span>MEDIUM</span><h3>어깨~쇄골</h3><ul><li>묶을 수 있음</li><li>뻗침 구간 확인</li><li>레이어 선택 폭이 넓음</li></ul><strong>중간 변화 · 균형형</strong></article>
          <article><span>LONG</span><h3>쇄골 아래</h3><ul><li>묶기 쉬움</li><li>건조 시간이 김</li><li>손상된 끝 관리 필요</li></ul><strong>낮은 커트 위험 · 긴 관리</strong></article>
        </div>
      </section>
      <section className={`${styles.intentSection} ${styles.intentSectionQuiet}`} aria-labelledby="women-change-budget-title">
        <IntentHeader eyebrow="CHANGE BUDGET" title="지금 감당할 수 있는 변화 폭부터 고르세요" description="모든 요소를 한 번에 바꾸지 않고 길이·앞머리·질감 중 한두 축만 선택합니다." />
        <div className={styles.changeBudget}>
          <div><strong>LOW</strong><h3>길이는 유지</h3><p>얼굴선 레이어 또는 가르마 하나만 조정</p></div>
          <div><strong>MEDIUM</strong><h3>한 구간 이동</h3><p>롱에서 미디엄처럼 끝선을 한 단계 이동</p></div>
          <div><strong>HIGH</strong><h3>길이와 실루엣 전환</h3><p>단발 전환은 묶임·수축·회복 기간까지 확인</p></div>
        </div>
      </section>
    </div>
  );
}

function BangsRiskPlanner() {
  const risks = [
    ["ROOT", "가마와 모류", "젖은 뒤 말렸을 때 갈라지는가?", "미용실에서 뿌리 방향 확인"],
    ["SHRINK", "곱슬과 수축", "마른 뒤 얼마나 짧아지는가?", "마른 길이를 기준으로 여유 확보"],
    ["CARE", "매일 손질", "아침에 물 적심과 드라이가 가능한가?", "어렵다면 긴 사이드뱅부터"],
    ["RETURN", "되돌림 시간", "옆으로 넘길 때까지 기다릴 수 있는가?", "오픈 기준 후보를 함께 보관"],
  ];
  return (
    <div className={styles.intentExperience} data-intent-experience="bangs-risk-planner">
      <section className={styles.intentSection} aria-labelledby="bangs-gate-title">
        <IntentHeader eyebrow="FOUR GATES" title="앞머리를 자르기 전 통과할 네 가지 질문" description="이미지가 마음에 드는지보다 실제 모발과 생활에서 유지되는지를 먼저 확인합니다." />
        <div className={styles.riskChecklist}>
          {risks.map(([code, title, question, action], index) => (
            <article key={code}><span>{String(index + 1).padStart(2, "0")}</span><div><p>{code}</p><h3>{title}</h3><strong>{question}</strong><small>{action}</small></div></article>
          ))}
        </div>
      </section>
      <section className={`${styles.intentSection} ${styles.intentSectionQuiet}`} aria-labelledby="bangs-return-title">
        <IntentHeader eyebrow="RETURN TIMELINE" title="자른 뒤 마음이 바뀌었을 때의 현실적인 경로" description="성장 속도는 개인차가 크지만, 바로 원래 상태로 돌아오지 않는다는 점을 계획에 포함합니다." />
        <ol className={styles.returnTimeline}>
          <li><span>0—2주</span><h3>현재 길이에 적응</h3><p>갈라짐과 들뜸을 확인하고 드라이 방향을 조정합니다.</p></li>
          <li><span>4—8주</span><h3>사이드로 연결</h3><p>짧은 부분을 옆머리와 연결할 수 있는지 다듬습니다.</p></li>
          <li><span>3개월+</span><h3>넘기는 길이로 이동</h3><p>가르마와 핀을 활용해 오픈 스타일로 전환합니다.</p></li>
        </ol>
      </section>
    </div>
  );
}

function MakeupDirectionPlanner() {
  return (
    <div className={styles.intentExperience} data-intent-experience="personal-color-makeup-planner">
      <section className={styles.intentSection} aria-labelledby="makeup-zone-title">
        <IntentHeader eyebrow="COLOR TO ZONE" title="퍼스널 컬러를 부위별 메이크업 질문으로 바꿉니다" description="계절 이름을 붙이는 데서 끝내지 않고 추천 팔레트가 눈·볼·입술의 색과 마감에 어떤 영향을 주는지 확인합니다." />
        <div className={styles.axisLedger}>
          <div className={styles.axisLedgerHead}><span>부위</span><span>추천 방향</span><span>실제 활용</span><span>확인할 한계</span></div>
          <div className={styles.axisLedgerRow}><strong>눈</strong><span>코코아 브라운</span><span>경계를 진하게 닫지 않는 음영</span><small>눈매 특징을 새로 판정하지 않음</small></div>
          <div className={styles.axisLedgerRow}><strong>볼</strong><span>뮤트 로즈</span><span>바깥쪽으로 얇게 연결</span><small>사진 발색과 실제 피부 차이</small></div>
          <div className={styles.axisLedgerRow}><strong>입술</strong><span>로즈 베이지</span><span>중심만 한 단계 선명하게</span><small>제품 제형과 본래 입술색 영향</small></div>
        </div>
      </section>
      <section className={`${styles.intentSection} ${styles.intentSectionQuiet}`} aria-labelledby="makeup-report-boundary-title">
        <IntentHeader eyebrow="REPORT BOUNDARY" title="고객 해설과 현장 명세는 같은 결과 안에서 역할을 나눕니다" description="AI는 왜 어울리는지와 활용법을 설명하고, 정확한 컬러·마감·강도·위치와 주의사항은 확정된 전문가 명세를 그대로 보여줍니다." />
        <ol className={styles.decisionSteps}>
          <li><span>01</span><div><h3>고객용 총평</h3><p>퍼스널 컬러와 확정 헤어가 메이크업 방향에 연결되는 이유를 설명합니다.</p></div></li>
          <li><span>02</span><div><h3>셀프 루틴</h3><p>준비 시간과 숙련도에 맞춘 실제 적용 순서를 확인합니다.</p></div></li>
          <li><span>03</span><div><h3>아티스트 브리프</h3><p>부위별 수치와 주의사항은 AI가 바꾸지 않고 권위 데이터를 전달합니다.</p></div></li>
        </ol>
      </section>
    </div>
  );
}

function SalonBriefBuilder() {
  return (
    <div className={styles.intentExperience} data-intent-experience="salon-brief-builder">
      <section className={styles.intentSection} aria-labelledby="salon-document-title">
        <IntentHeader eyebrow="BRIEF PREVIEW" title="미용실에 가져갈 한 장은 이렇게 구성됩니다" description="후보 사진만 전달하지 않고 원하는 공통점, 피할 조건과 현장에서 확인할 질문을 한 문서에 묶습니다." />
        <div className={styles.salonDocument}>
          <header><div><span>HAIRFIT SALON BRIEF</span><h3>상담용 후보 보드 · 예시</h3></div><strong>3 candidates</strong></header>
          <div className={styles.salonDocumentGrid}>
            <section><span>WANT</span><p>턱 아래 끝선</p><p>낮은 옆 볼륨</p><p>가벼운 앞머리</p></section>
            <section><span>AVOID</span><p>눈을 덮는 길이</p><p>매일 열기구가 필요한 컬</p><p>묶이지 않는 어깨선</p></section>
            <section><span>CHECK AT SALON</span><p>현재 손상도에서 가능한가?</p><p>건조 뒤 끝선은 어디인가?</p><p>유지 커트는 몇 주 간격인가?</p></section>
          </div>
          <footer>예시 문서 · 전문 판단과 시술 가능 여부는 현장에서 확인</footer>
        </div>
      </section>
      <section className={`${styles.intentSection} ${styles.intentSectionQuiet}`} aria-labelledby="salon-conversation-title">
        <IntentHeader eyebrow="CONVERSATION FLOW" title="보여주고, 말하고, 묻고, 다시 확인합니다" description="상담의 목적은 사진을 그대로 복제하는 것이 아니라 서로 같은 결과를 상상하도록 기준을 맞추는 것입니다." />
        <ol className={styles.conversationFlow}>
          <li><span>SHOW</span><h3>후보 2–3개</h3><p>각 사진에서 공통으로 좋은 부분을 짚습니다.</p></li>
          <li><span>SAY</span><h3>원하는 점과 피할 점</h3><p>길이·앞머리·볼륨을 구체적인 선으로 말합니다.</p></li>
          <li><span>ASK</span><h3>모발 상태와 가능 범위</h3><p>손상도, 수축과 필요한 시술을 질문합니다.</p></li>
          <li><span>CONFIRM</span><h3>마른 뒤 결과와 관리</h3><p>최종 끝선, 손질법과 유지 주기를 다시 확인합니다.</p></li>
        </ol>
      </section>
    </div>
  );
}
