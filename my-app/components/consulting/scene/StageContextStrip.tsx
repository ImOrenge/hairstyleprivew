import type { ConsultationSnapshot, ConsultationStage } from "../../../lib/consulting/contracts";
import type { CustomerStylebookConsultationReferenceContextV2 } from "@hairfit/shared";

const CONTEXT: Partial<Record<ConsultationStage, { reflected: string; focus: string; result: string }>> = {
  analysis: {
    reflected: "사진 품질과 상담 목표",
    focus: "얼굴 윤곽·모발 특성·추천 근거",
    result: "스타일 방향을 정할 기준",
  },
  "personal-color": {
    reflected: "촬영 환경과 피부색 관찰",
    focus: "온도·명도·채도·대비",
    result: "추천·회피 팔레트",
  },
  direction: {
    reflected: "진단 결과와 원하는 변화",
    focus: "기장·볼륨·앞머리·질감",
    result: "헤어 생성 기준",
  },
  previews: {
    reflected: "확정한 헤어 방향",
    focus: "어울림과 실제 구현 가능성",
    result: "비교할 헤어 후보",
  },
  compare: {
    reflected: "내가 고른 후보",
    focus: "인상·관리·시술 차이",
    result: "최종 헤어 1개",
  },
  decision: {
    reflected: "최종 후보와 현재 모발",
    focus: "필요 시술과 관리 조건",
    result: "확정 헤어와 살롱 전달 내용",
  },
  "color-studio": {
    reflected: "퍼스널 컬러와 확정 헤어",
    focus: "컬러·밝기·탈색 여부",
    result: "최종 헤어 컬러",
  },
  makeup: {
    reflected: "퍼스널 컬러·헤어·추가 요구",
    focus: "분위기와 부위별 강도",
    result: "전문 리포트와 적용 루틴",
  },
  fashion: {
    reflected: "확정한 헤어·컬러·메이크업",
    focus: "실루엣·넥라인·팔레트",
    result: "활용할 패션 방향",
  },
  result: {
    reflected: "상담에서 확정한 모든 선택",
    focus: "이유·활용법·현장 확인점",
    result: "최종 리포트와 PDF",
  },
};

export function StageContextStrip({ snapshot, stage, stylebookReference = null }: { snapshot: ConsultationSnapshot; stage: ConsultationStage; stylebookReference?: CustomerStylebookConsultationReferenceContextV2 | null }) {
  const context = CONTEXT[stage];
  if (!context && !stylebookReference) return null;
  const reference = stylebookReference ? (
    <div className="mb-3 flex items-center gap-3 border border-[var(--app-border-strong)] bg-[var(--app-surface)] p-3 text-sm" data-consulting-stylebook-reference="true">
      <p><strong>스타일북 참고</strong> · {stylebookReference.item.title}<br /><span className="text-xs text-[var(--app-muted)]">질문과 단계는 그대로 진행하며, 이 결과는 참고 기준으로만 사용합니다.</span></p>
    </div>
  ) : null;
  if (!context) return <div className="mt-5">{reference}</div>;
  const goal = snapshot.discovery.goals[0];
  const reflected = goal ? `${context.reflected} · ${goal}` : context.reflected;
  const items = [
    ["반영한 기준", reflected],
    ["이번에 확인할 것", context.focus],
    ["완료 후 받는 결과", context.result],
  ];
  const content = (className: string) => (
    <dl className={className}>
      {items.map(([label, value]) => (
        <div key={label} className="grid gap-1 border-b border-[var(--app-border)] p-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
          <dt className="text-xs font-black text-[var(--app-muted)]">{label}</dt>
          <dd className="m-0 font-bold leading-5">{value}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <div className="mt-5" data-consulting-stage-context="true">
      {reference}
      <details className="border border-[var(--app-border)] bg-[var(--app-surface)] text-sm sm:hidden">
        <summary className="cursor-pointer px-4 py-3 font-black">이번 결과에 반영한 기준</summary>
        {content("grid border-t border-[var(--app-border)]")}
      </details>
      {content("hidden border border-[var(--app-border)] bg-[var(--app-surface)] text-sm sm:grid sm:grid-cols-3")}
    </div>
  );
}
