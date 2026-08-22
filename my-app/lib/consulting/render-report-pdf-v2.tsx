/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer Image has no DOM alt prop. */
import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { consultationReportStatusLabelV2, type ConsultationReportImageV2, type ConsultationReportSectionV2, type ConsultationReportViewModelV2 } from "@hairfit/shared/consulting/report-v2";
import type { ConsultationResultNarrativePanelV1 } from "@hairfit/shared/consulting/report-narrative";

let fontRegistered = false;

function registerReportFont() {
  if (fontRegistered) return;
  Font.register({ family: "NanumGothic", src: path.join(process.cwd(), "assets", "fonts", "NanumGothic-Regular.ttf") });
  Font.registerHyphenationCallback((word) => [word]);
  fontRegistered = true;
}

const styles = StyleSheet.create({
  page: { fontFamily: "NanumGothic", fontSize: 8.5, lineHeight: 1.55, color: "#181713", backgroundColor: "#f7f4ec", padding: 32 },
  header: { borderBottomWidth: 1.5, borderBottomColor: "#181713", paddingBottom: 14, marginBottom: 16 },
  eyebrow: { fontSize: 7, letterSpacing: 2, color: "#8a6418", marginBottom: 7 },
  title: { fontSize: 22, lineHeight: 1.2, marginBottom: 8 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 11 },
  meta: { borderWidth: 0.7, borderColor: "#b9b1a3", paddingHorizontal: 7, paddingVertical: 4, fontSize: 7 },
  narrative: { borderWidth: 0.8, borderColor: "#8a6418", backgroundColor: "#fffaf0", padding: 12, marginTop: 12 },
  narrativeTitle: { fontSize: 13, lineHeight: 1.25, marginBottom: 5 },
  group: { borderBottomWidth: 1.5, borderBottomColor: "#181713", marginTop: 18, paddingBottom: 6 },
  groupTitle: { fontSize: 17 },
  section: { borderTopWidth: 0.7, borderTopColor: "#b9b1a3", paddingTop: 12, marginTop: 12 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  sectionTitle: { fontSize: 13, lineHeight: 1.25 },
  status: { borderWidth: 0.7, borderColor: "#8a6418", color: "#6e4d0d", paddingHorizontal: 6, paddingVertical: 3, fontSize: 7 },
  conclusion: { fontSize: 9.5, marginBottom: 8 },
  line: { marginTop: 3, paddingLeft: 9 },
  label: { color: "#777064", fontSize: 6.5, marginTop: 7, marginBottom: 2 },
  imageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 8 },
  imageCard: { width: 118, borderWidth: 0.7, borderColor: "#b9b1a3", padding: 4 },
  image: { width: 108, height: 126, objectFit: "cover", backgroundColor: "#e8e3d8" },
  imageLabel: { fontSize: 6.5, marginTop: 4 },
  footer: { borderTopWidth: 1, borderTopColor: "#181713", marginTop: 18, paddingTop: 10, color: "#58544b", fontSize: 7 },
  pageNumber: { position: "absolute", bottom: 16, right: 32, color: "#777064", fontSize: 7 },
});

function preparationLabel(state: string) {
  if (["accepted", "completed", "selected"].includes(state)) return "준비 완료";
  if (state === "failed") return "다시 준비 필요";
  return "준비 중";
}

function sectionLines(section: ConsultationReportSectionV2) {
  switch (section.key) {
    case "face-hair-analysis": return [
      `가장 가까운 얼굴형: ${section.payload.primary ?? "확인 불가"}`,
      ...section.payload.distribution.map((item) => `${item.label}: ${Math.round(item.probability * 100)}%`),
      ...section.payload.observations.map((item) => `${item.label}: ${item.value}`),
      ...section.payload.measurements.map((item) => `${item.label}: ${item.value}`),
    ];
    case "hair-direction": return section.payload.axes.map((item) => `${item.label}: ${item.value}${item.reason ? ` · ${item.reason}` : ""}`);
    case "candidate-comparison": return [
      `준비된 스타일: ${section.payload.acceptedCount}개`,
      ...section.payload.candidates.map((item) => `${item.rank ? `${item.rank}순위` : "추천 순서 확인 중"} · ${item.label} · ${preparationLabel(item.generationState)}${item.isPrimary ? " · AI 추천" : ""}${item.isConfirmed ? " · 내가 고른 스타일" : ""} · ${item.reason}`),
    ];
    case "final-hair": return [`확정 스타일: ${section.payload.label}`, `구현 가능성: ${section.payload.feasibility}`, `현재 모발과 차이: ${section.payload.currentHairGap}`, `필요 시술: ${section.payload.services.join(" · ") || "없음"}`, `관리: ${section.payload.maintenance}`];
    case "personal-color": return [
      `진단: ${section.payload.classification ?? "확인 불가"}`,
      ...section.payload.posterior.map((item) => `${item.label}: ${Math.round(item.probability * 100)}%`),
      ...section.payload.axes.map((item) => `${item.label}: ${item.value === null ? "확인 불가" : Math.round(item.value * 100)}`),
      ...Object.entries(section.payload.palettes).map(([key, colors]) => `${key}: ${colors.join(" · ") || "없음"}`),
    ];
    case "final-color": return [`컬러: ${section.payload.colorName}`, `기법: ${section.payload.technique}`, `목표 레벨: ${section.payload.targetLevel ?? "현장 확인"}`, `탈색: ${section.payload.bleachPolicy}`, `퇴색 방향: ${section.payload.fadeDirection || "확인 필요"}`];
    case "makeup-result": return section.payload.professionalReport ? [] : section.payload.modules.map((item) => `${item.module}: ${item.enabled ? "사용" : "제외"}${item.color ? ` · ${item.color}` : ""}${item.texture ? ` · ${item.texture}` : ""}`);
    case "fashion-result": return [
      `준비된 패션 제안: ${section.payload.completedCount}개`,
      ...section.payload.looks.flatMap((look) => [`${look.label} · ${preparationLabel(look.generationState)}${look.isRecommended ? " · AI 추천" : ""}${look.isSelected ? " · 내가 고른 스타일" : ""}`, `실루엣·네크라인: ${look.silhouette} · ${look.neckline}`, `구성: ${look.items.join(" · ")}`, `팔레트: ${look.palette.join(" · ")}`]),
      ...section.payload.products.flatMap((product) => [`연결 상품: ${product.brandName} ${product.productName}`, `${product.priceAmount.toLocaleString("ko-KR")} ${product.currency} · ${product.availability}`]),
    ];
    case "executive-summary": return [...section.payload.outcomes.map((item) => `${item.label}: ${item.value}`), `변화 강도: ${section.payload.changeIntensity}`, `관리 난이도: ${section.payload.maintenanceDifficulty}`, `살롱 시술: ${section.payload.salonRequired ? "필요" : "선택"}`];
    case "salon-specification": return [`고객 요약: ${section.payload.customerSummary}`, `커트: ${section.payload.services.cut.join(" · ") || "없음"}`, `펌: ${section.payload.services.perm.join(" · ") || "없음"}`, `컬러: ${section.payload.services.color.join(" · ") || "없음"}`, ...section.payload.design.map((item) => `${item.label}: ${item.value}`), `스타일링: ${section.payload.styling.join(" · ") || "없음"}`, `주의: ${section.payload.cautions.join(" · ") || "없음"}`];
    case "initial-care": return section.payload.periods.flatMap((period) => [period.label, ...period.actions.map((item) => `  ${item}`)]).concat(["초기 체크리스트", ...section.payload.checklist]);
  }
}

function sectionImages(section: ConsultationReportSectionV2): ConsultationReportImageV2[] {
  switch (section.key) {
    case "candidate-comparison": return section.payload.candidates.map((item) => item.image);
    case "final-hair": return [section.payload.image];
    case "final-color": return section.payload.image ? [section.payload.image] : [];
    case "makeup-result": return section.payload.moodImage ? [section.payload.moodImage] : [];
    case "fashion-result": return section.payload.looks.flatMap((item) => item.image ? [item.image] : []);
    case "executive-summary": return section.payload.heroImage ? [section.payload.heroImage] : [];
    default: return [];
  }
}

function Section({ section }: { section: ConsultationReportSectionV2 }) {
  const lines = sectionLines(section);
  const images = sectionImages(section).filter((image) => image.src);
  return <View style={styles.section} minPresenceAhead={60}>
    <View style={styles.sectionHead}><View><Text style={styles.eyebrow}>{section.kicker}</Text><Text style={styles.sectionTitle}>{section.title}</Text></View><Text style={styles.status}>{consultationReportStatusLabelV2(section.status)}</Text></View>
    <Text style={styles.conclusion}>{section.conclusion}</Text>
    {section.key === "makeup-result" && section.payload.professionalReport ? <View style={styles.narrative} minPresenceAhead={80}>
      <Text style={styles.eyebrow}>{section.payload.professionalReport.state === "ready" ? "AI 메이크업 디렉터 리포트" : "메이크업 디렉터 리포트"}</Text>
      <Text style={styles.narrativeTitle}>{section.payload.professionalReport.content.headline}</Text>
      {section.payload.professionalReport.content.summary.map((item, index) => <Text key={`makeup-summary-${index}`} style={styles.line}>• {item.text}</Text>)}
      <Text style={styles.label}>이 방향이 잘 맞는 이유</Text>
      {section.payload.professionalReport.content.fitReasons.map((item, index) => <Text key={`makeup-reason-${index}`} style={styles.line}>• {item.text}</Text>)}
      <Text style={styles.label}>부위별 디렉팅</Text>
      {section.payload.professionalReport.content.moduleInsights.flatMap((item) => item.summary.map((line, index) => <Text key={`makeup-module-${item.module}-${index}`} style={styles.line}>• {item.module}: {line.text}</Text>))}
      <Text style={styles.label}>실제로 활용하는 방법</Text>
      {section.payload.professionalReport.content.applicationTips.map((item, index) => <Text key={`makeup-tip-${index}`} style={styles.line}>• {item.text}</Text>)}
      {section.payload.routine ? <><Text style={styles.label}>셀프 메이크업 적용 순서 · {Math.ceil(section.payload.routine.estimatedSeconds / 60)}분 이내</Text>{section.payload.routine.steps.map((step) => <Text key={`makeup-routine-${step.order}`} style={styles.line}>• {step.order}. {step.module}: {step.instruction}</Text>)}</> : null}
      {section.payload.artistBrief ? <><Text style={styles.label}>메이크업 아티스트용 상세 명세</Text>{section.payload.artistBrief.moduleSummaries.map((item) => <Text key={`makeup-brief-${item.module}`} style={styles.line}>• {item.module}: {item.enabled ? `${item.colorFamily ?? "현장 선택"} · ${item.finish} · 강도 ${Math.round(item.intensity * 100)}% · ${item.placement.join(" · ")} · ${item.applicationDirection.join(" · ")} · ${item.technique}` : "제외"}</Text>)}</> : null}
    </View> : null}
    {lines.map((line, index) => <Text key={`${section.key}-line-${index}`} style={styles.line}>• {line}</Text>)}
    {section.rationale.length ? <><Text style={styles.label}>이 결과가 잘 맞는 이유</Text>{section.rationale.map((item, index) => <Text key={`${section.key}-rationale-${index}`} style={styles.line}>• {item}</Text>)}</> : null}
    {section.effects.length ? <><Text style={styles.label}>기대할 수 있는 변화</Text>{section.effects.map((item, index) => <Text key={`${section.key}-effect-${index}`} style={styles.line}>• {item}</Text>)}</> : null}
    {section.avoid.length ? <><Text style={styles.label}>피해야 할 선택</Text>{section.avoid.map((item, index) => <Text key={`${section.key}-avoid-${index}`} style={styles.line}>• {item}</Text>)}</> : null}
    {section.cautions.length ? <><Text style={styles.label}>시술 전 확인할 점</Text>{section.cautions.map((item, index) => <Text key={`${section.key}-caution-${index}`} style={styles.line}>• {item}</Text>)}</> : null}
    {images.length ? <View style={styles.imageGrid}>{images.map((image) => <View key={image.id} style={styles.imageCard}><Image src={image.src!} style={styles.image} /><Text style={styles.imageLabel}>{image.label}</Text></View>)}</View> : null}
  </View>;
}

function Narrative({ panel, state }: { panel: ConsultationResultNarrativePanelV1; state: NonNullable<ConsultationReportViewModelV2["narrative"]>["state"] }) {
  return <View style={styles.narrative} minPresenceAhead={70}>
    <Text style={styles.eyebrow}>{state === "ready" ? "AI 스타일 해설" : "스타일 해설"}</Text>
    <Text style={styles.narrativeTitle}>{panel.headline}</Text>
    {panel.summary.map((item, index) => <Text key={`summary-${index}`} style={styles.line}>• {item.text}</Text>)}
    <Text style={styles.label}>이 결과가 잘 맞는 이유</Text>
    {panel.fitReasons.map((item, index) => <Text key={`reason-${index}`} style={styles.line}>• {item.text}</Text>)}
    <Text style={styles.label}>이렇게 활용해 보세요</Text>
    {panel.actions.map((item, index) => <Text key={`action-${index}`} style={styles.line}>• {item.text}</Text>)}
  </View>;
}

function ReportPdfDocumentV2({ report }: { report: ConsultationReportViewModelV2 }) {
  return <Document title={report.headline} author="HairFit AI Consultant" subject="HairFit consultation result report">
    <Page size="A4" wrap style={styles.page}>
      <View style={styles.header}><Text style={styles.eyebrow}>HAIRFIT AI CONSULTANT · 상담 결과</Text><Text style={styles.title}>{report.headline}</Text><View style={styles.metaRow}><Text style={styles.meta}>{consultationReportStatusLabelV2(report.status)}</Text><Text style={styles.meta}>작성일 {report.generatedAt}</Text></View></View>
      {report.tabs.map((tab) => {
        const hasDedicatedMakeupReport = tab.key === "makeup" && tab.sections.some((section) => section.key === "makeup-result" && Boolean(section.payload.professionalReport));
        const panel = report.narrative && !hasDedicatedMakeupReport ? (tab.key === "final" ? report.narrative.content.overall : report.narrative.content.tabs[tab.key]) : null;
        return <View key={tab.key}><View style={styles.group} break><Text style={styles.eyebrow}>상담 결과</Text><Text style={styles.groupTitle}>{tab.label}</Text></View>{panel ? <Narrative panel={panel} state={report.narrative!.state} /> : null}{tab.sections.map((section) => <Section key={section.key} section={section} />)}</View>;
      })}
      <View style={styles.footer} wrap={false}><Text>원본 얼굴·시술 후 사진은 포함하지 않습니다. 실제 시술 이후 장기 관리는 별도 케어 프로그램에서 진행합니다.</Text><Text>AI 해설은 상담에서 확인한 사실을 이해하기 쉽게 설명하며, 주의사항과 시술 명세의 의미를 바꾸지 않습니다.</Text><Text>AI 분석은 의료 진단이 아니며 실제 시술 전 디자이너 확인이 우선합니다. · 문서 확인번호 {report.integrityCode}</Text></View>
      <Text style={styles.pageNumber} fixed render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </Page>
  </Document>;
}

export async function renderConsultationReportPdfV2(report: ConsultationReportViewModelV2) {
  registerReportFont();
  return renderToBuffer(<ReportPdfDocumentV2 report={report} />);
}
