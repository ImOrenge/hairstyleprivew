import {
  effectiveEvidencePointV2,
  hasEvidencePointCorrectionV2,
  type AnalysisEvidenceV2,
  type EvidenceSourceV2,
  type NormalizedPointV2,
} from "@hairfit/shared";
import { Image, StyleSheet, Text, View } from "react-native";

const COLORS: Record<EvidenceSourceV2, string> = {
  detected: "#43d9ad",
  inferred: "#f5c76a",
  user_adjusted: "#e987ff",
};

function pointStyle(point: NormalizedPointV2, color: string, size = 5) {
  return {
    backgroundColor: color,
    borderColor: "#101010",
    borderRadius: size / 2,
    borderWidth: 1,
    height: size,
    left: `${point.x * 100}%` as `${number}%`,
    marginLeft: -size / 2,
    marginTop: -size / 2,
    position: "absolute" as const,
    top: `${point.y * 100}%` as `${number}%`,
    width: size,
  };
}

export function NativeFaceEvidenceOverlay({ evidence, sourceImageUrl }: {
  evidence: AnalysisEvidenceV2;
  sourceImageUrl: string | null;
}) {
  const aspectRatio = evidence.sourceTransform.sourceWidth / evidence.sourceTransform.sourceHeight;
  return (
    <View
      accessibilityLabel={`서버 얼굴 분석 근거 ${evidence.id}. 랜드마크 ${evidence.landmarks.length}개, 측정 ${evidence.measurements.length}개`}
      accessibilityRole="image"
      style={[styles.frame, { aspectRatio }]}
      testID="native-face-evidence-overlay"
    >
      {sourceImageUrl ? <Image source={{ uri: sourceImageUrl }} style={StyleSheet.absoluteFillObject} /> : null}
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        {evidence.contours.flatMap((line) => line.points.map((point, index) => (
          <View key={`contour-${line.id}-${index}`} style={pointStyle(effectiveEvidencePointV2(evidence, "contour", line.id, index, point), COLORS[hasEvidencePointCorrectionV2(evidence, "contour", line.id, index) ? "user_adjusted" : line.source], 4)} />
        )))}
        {(evidence.hairline?.lines ?? []).flatMap((line) => line.points.map((point, index) => (
          <View key={`hairline-${line.id}-${index}`} style={pointStyle(effectiveEvidencePointV2(evidence, "hairline", line.id, index, point), COLORS[hasEvidencePointCorrectionV2(evidence, "hairline", line.id, index) ? "user_adjusted" : line.source], 5)} />
        )))}
        {evidence.landmarks.map((landmark) => (
          <View key={landmark.id} style={pointStyle(effectiveEvidencePointV2(evidence, "landmark", landmark.id, 0, landmark.point), COLORS[hasEvidencePointCorrectionV2(evidence, "landmark", landmark.id, 0) ? "user_adjusted" : landmark.source], 7)} />
        ))}
      </View>
      <View style={styles.legend}>
        <Text style={styles.legendText}>detected · inferred · user_adjusted · Evidence {evidence.id.slice(0, 8)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: "#24231f",
    borderColor: "#34322c",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  legend: {
    backgroundColor: "rgba(16,16,16,0.78)",
    bottom: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    position: "absolute",
  },
  legendText: {
    color: "#f4f1e8",
    fontSize: 10,
    fontWeight: "800",
  },
});
