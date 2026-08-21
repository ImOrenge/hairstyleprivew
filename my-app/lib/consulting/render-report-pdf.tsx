import path from "node:path";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { ConsultationReportViewModelV1 } from "@hairfit/shared/consulting/report";
import { consultationReportStatusLabel } from "@hairfit/shared/consulting/report";

let fontRegistered = false;

function registerReportFont() {
  if (fontRegistered) return;
  Font.register({
    family: "NanumGothic",
    src: path.join(process.cwd(), "assets", "fonts", "NanumGothic-Regular.ttf"),
  });
  Font.registerHyphenationCallback((word) => [word]);
  fontRegistered = true;
}

const styles = StyleSheet.create({
  page: { fontFamily: "NanumGothic", fontSize: 8.5, lineHeight: 1.55, color: "#181713", backgroundColor: "#f7f4ec", padding: 32 },
  header: { borderBottomWidth: 1.5, borderBottomColor: "#181713", paddingBottom: 14, marginBottom: 16 },
  eyebrow: { fontSize: 7, letterSpacing: 2, color: "#8a6418", marginBottom: 7 },
  title: { fontSize: 22, lineHeight: 1.2, marginBottom: 8 },
  subtitle: { fontSize: 9, color: "#58544b", maxWidth: 440 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 11 },
  meta: { borderWidth: 0.7, borderColor: "#b9b1a3", paddingHorizontal: 7, paddingVertical: 4, fontSize: 7 },
  section: { borderTopWidth: 0.7, borderTopColor: "#b9b1a3", paddingTop: 12, marginTop: 12 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  sectionNumber: { color: "#8a6418", fontSize: 7, letterSpacing: 1.5, marginBottom: 3 },
  sectionTitle: { fontSize: 13, lineHeight: 1.25 },
  status: { borderWidth: 0.7, borderColor: "#8a6418", color: "#6e4d0d", paddingHorizontal: 6, paddingVertical: 3, fontSize: 7 },
  summary: { color: "#58544b", marginBottom: 8 },
  fieldGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  field: { width: "50%", paddingHorizontal: 4, marginBottom: 7 },
  fieldLabel: { color: "#777064", fontSize: 6.5, marginBottom: 2 },
  fieldValue: { fontSize: 8.5 },
  bullet: { marginTop: 3, paddingLeft: 9 },
  imageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 8 },
  imageCard: { width: 118, borderWidth: 0.7, borderColor: "#b9b1a3", padding: 4 },
  image: { width: 108, height: 126, objectFit: "cover", backgroundColor: "#e8e3d8" },
  imageLabel: { fontSize: 6.5, marginTop: 4 },
  footer: { borderTopWidth: 1, borderTopColor: "#181713", marginTop: 18, paddingTop: 10, color: "#58544b", fontSize: 7 },
  pageNumber: { position: "absolute", bottom: 16, right: 32, color: "#777064", fontSize: 7 },
});

function ReportPdfDocument({ report }: { report: ConsultationReportViewModelV1 }) {
  return <Document title={report.headline} author="HairFit AI Consultant" subject="HairFit consultation report">
    <Page size="A4" wrap style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>HAIRFIT AI CONSULTANT · JOURNEY REPORT</Text>
        <Text style={styles.title}>{report.headline}</Text>
        <Text style={styles.subtitle}>상담 입력부터 분석, 헤어·컬러·메이크업·패션 결정과 사후관리 상태까지 한 문서에 정리한 결과 명세입니다.</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>상담 v{report.consultationVersion}</Text>
          <Text style={styles.meta}>결과 v{report.resultVersion}</Text>
          <Text style={styles.meta}>{consultationReportStatusLabel(report.status)}</Text>
          <Text style={styles.meta}>무결성 {report.integrityCode}</Text>
        </View>
      </View>

      {report.heroImage?.src ? <View wrap={false} style={styles.imageCard}>
        {/* react-pdf Image does not expose the DOM alt prop; the adjacent Text is its PDF label. */}
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image src={report.heroImage.src} style={styles.image} />
        <Text style={styles.imageLabel}>{report.heroImage.label}</Text>
      </View> : null}

      {report.sections.map((section) => <View key={section.key} style={styles.section} minPresenceAhead={60}>
        <View style={styles.sectionHead}>
          <View>
            <Text style={styles.sectionNumber}>{section.number} · {section.kicker}</Text>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
          <Text style={styles.status}>{consultationReportStatusLabel(section.status)}</Text>
        </View>
        <Text style={styles.summary}>{section.summary}</Text>
        <View style={styles.fieldGrid}>
          {section.fields.map((field) => <View key={`${section.key}-${field.label}`} style={styles.field}>
            <Text style={styles.fieldLabel}>{field.label}</Text>
            <Text style={styles.fieldValue}>{field.value}</Text>
            {field.note ? <Text style={styles.fieldLabel}>{field.note}</Text> : null}
          </View>)}
        </View>
        {section.bullets.map((bullet, index) => <Text key={`${section.key}-bullet-${index}`} style={styles.bullet}>• {bullet}</Text>)}
        {section.images.length ? <View style={styles.imageGrid}>
          {section.images.filter((item) => item.src).map((item) => <View key={item.id} style={styles.imageCard}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={item.src!} style={styles.image} />
            <Text style={styles.imageLabel}>{item.label}</Text>
          </View>)}
        </View> : null}
      </View>)}

      <View style={styles.footer} wrap={false}>
        <Text>원본 얼굴 사진은 이 문서에 포함하지 않습니다. AI 분석은 의료 진단이 아니며 실제 시술 전 디자이너의 모발 상태 확인이 우선합니다.</Text>
        <Text>생성 시각 {report.generatedAt} · Report {report.reportId}</Text>
      </View>
      <Text style={styles.pageNumber} fixed render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </Page>
  </Document>;
}

export async function renderConsultationReportPdf(report: ConsultationReportViewModelV1) {
  registerReportFont();
  return renderToBuffer(<ReportPdfDocument report={report} />);
}
