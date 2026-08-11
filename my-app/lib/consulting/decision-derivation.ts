import type { ConsultationPreview, ConsultationSnapshot } from "./contracts";

export interface DecisionDerivation {
  feasibility: string;
  currentHairGap: string;
  services: string[];
  maintenance: string;
  limitations: string[];
}

export interface ComparisonAxis {
  id: "face-balance" | "silhouette-volume" | "current-hair-gap" | "services" | "damage-feasibility" | "maintenance-time" | "salon-cycle" | "limitations";
  label: string;
  value: string;
  evidence: string;
}

export function deriveDecisionSnapshot(snapshot: ConsultationSnapshot): DecisionDerivation {
  const services = snapshot.discovery.allowedServices.length
    ? snapshot.discovery.allowedServices
    : snapshot.discovery.desiredServices.filter((service) => service !== "아직 모름");
  const damageWarning = snapshot.discovery.damageLevel === "높음"
    ? "손상도가 높아 밝은 컬러·강한 펌보다 모발 안전과 디자이너 현장 확인을 우선합니다."
    : snapshot.discovery.damageLevel === "보통"
      ? "현재 손상 범위를 확인한 뒤 허용한 시술 안에서 진행할 수 있습니다."
      : "현재 입력 기준으로 허용한 시술 범위에서 구현 가능성이 높습니다.";
  const currentHairGap = [
    `${snapshot.discovery.hairLength} 길이`,
    `${snapshot.discovery.hairTexture}`,
    `모량 ${snapshot.discovery.hairDensity}`,
    `굵기 ${snapshot.discovery.strandThickness}`,
    `손상 ${snapshot.discovery.damageLevel}`,
  ].join(" · ");
  const limitations = [...new Set([
    ...snapshot.discovery.avoid,
    ...snapshot.evidence.items.filter((item) => item.confidence === "low").map((item) => `${item.layer}: ${item.evidence}`),
    snapshot.faceAnalysis.confidence === "low" ? "얼굴 분석 신뢰도가 낮아 디자이너 확인 필요" : "",
  ].filter(Boolean))];
  return {
    feasibility: damageWarning,
    currentHairGap,
    services,
    maintenance: `아침 ${snapshot.discovery.morningMinutes}분 · 열기구 ${snapshot.discovery.heatStyling} · ${snapshot.discovery.salonCycleWeeks}주 방문 · ${snapshot.discovery.maintenanceLevel} 관리 강도`,
    limitations,
  };
}

export function buildComparisonAxes(snapshot: ConsultationSnapshot, candidate: ConsultationPreview): ComparisonAxis[] {
  const decision = deriveDecisionSnapshot(snapshot);
  return [
    { id: "face-balance", label: "얼굴 균형", value: snapshot.faceAnalysis.balance, evidence: `${snapshot.faceAnalysis.faceShape} · ${candidate.axis}` },
    { id: "silhouette-volume", label: "실루엣·볼륨", value: `정수리 ${snapshot.strategy.crownVolume} · 측면 ${snapshot.strategy.sideVolume} · ${snapshot.strategy.texture}`, evidence: candidate.reason },
    { id: "current-hair-gap", label: "현재 모발 차이", value: decision.currentHairGap, evidence: snapshot.discovery.currentHair },
    { id: "services", label: "필요·허용 시술", value: decision.services.join(", ") || "커트·드라이 중심", evidence: `사용자가 허용한 시술 ${snapshot.discovery.allowedServices.join(", ") || "없음"}` },
    { id: "damage-feasibility", label: "손상·실현 가능성", value: decision.feasibility, evidence: `손상 입력 ${snapshot.discovery.damageLevel}` },
    { id: "maintenance-time", label: "관리 시간", value: `${snapshot.discovery.morningMinutes}분 · 열기구 ${snapshot.discovery.heatStyling}`, evidence: `${snapshot.discovery.maintenanceLevel} 관리 강도` },
    { id: "salon-cycle", label: "미용실 주기", value: `${snapshot.discovery.salonCycleWeeks}주`, evidence: `전략 revision ${snapshot.strategy.revision}` },
    { id: "limitations", label: "제약·불확실성", value: decision.limitations.join(", ") || "사진과 현장 모질 차이는 디자이너 확인", evidence: `${snapshot.evidence.items.filter((item) => item.confidence === "low").length}개 낮은 신뢰 근거` },
  ];
}
