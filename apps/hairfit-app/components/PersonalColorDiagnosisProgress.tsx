import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "@hairfit/ui-native";

const diagnosisMessages = [
  "얼굴 톤 기준점을 잡는 중",
  "웜/쿨 밸런스를 비교하는 중",
  "컬러 스와치를 대조하는 중",
  "추천/비추천 팔레트를 정리하는 중",
  "스타일링에 사용할 결과를 저장하는 중",
];

const swatches = [
  "#F6E8D7",
  "#D8B58A",
  "#B98248",
  "#D94A32",
  "#F07B73",
  "#6E7045",
  "#F8F8F5",
  "#A9B0B8",
  "#34363A",
  "#B5122B",
  "#C44575",
  "#2E5AAC",
  "#B8A9D9",
  "#A8B8A0",
  "#182642",
  "#4D3426",
];

const analysisSwatches = [
  { name: "Warm Ivory", label: "웜 아이보리", hex: "#F6E8D7", base: 68, drift: 11 },
  { name: "Camel", label: "카멜", hex: "#D8B58A", base: 57, drift: 16 },
  { name: "Tomato Red", label: "토마토 레드", hex: "#D94A32", base: 49, drift: 19 },
  { name: "Soft Olive", label: "소프트 올리브", hex: "#A8B8A0", base: 63, drift: 12 },
  { name: "Cool Gray", label: "쿨 그레이", hex: "#A9B0B8", base: 61, drift: 14 },
  { name: "Cherry Pink", label: "체리 핑크", hex: "#C44575", base: 54, drift: 18 },
  { name: "Cobalt Blue", label: "코발트 블루", hex: "#2E5AAC", base: 46, drift: 21 },
  { name: "Deep Navy", label: "딥 네이비", hex: "#182642", base: 59, drift: 17 },
];

function getAnalysisScore(base: number, drift: number, tick: number, index: number) {
  const wave = Math.sin((tick + index * 1.7) * 0.72);
  const pulse = Math.cos((tick * 0.42) + index);
  return Math.max(18, Math.min(96, Math.round(base + wave * drift + pulse * 4)));
}

export function FaceScanOverlay({ active }: { active: boolean }) {
  const scan = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      scan.stopAnimation();
      pulse.stopAnimation();
      return;
    }

    const scanAnimation = Animated.loop(
      Animated.timing(scan, {
        toValue: 1,
        duration: 1650,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    scanAnimation.start();
    pulseAnimation.start();
    return () => {
      scanAnimation.stop();
      pulseAnimation.stop();
    };
  }, [active, pulse, scan]);

  if (!active) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.scanOverlay}>
      <View style={styles.scanTint} />
      <View style={styles.scanFrameTop} />
      <View style={styles.scanFrameBottom} />
      <Animated.View
        style={[
          styles.scanLine,
          {
            opacity: scan.interpolate({
              inputRange: [0, 0.12, 0.76, 1],
              outputRange: [0, 1, 1, 0],
            }),
            transform: [
              {
                translateY: scan.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 360],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View style={[styles.scanPulse, { opacity: pulse }]} />
    </View>
  );
}

export function PersonalColorDiagnosisProgress() {
  const flow = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const flowAnimation = Animated.loop(
      Animated.timing(flow, {
        toValue: 1,
        duration: 5500,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    const messageTimer = setInterval(() => {
      setMessageIndex((current) => (current + 1) % diagnosisMessages.length);
    }, 1700);

    flowAnimation.start();
    pulseAnimation.start();
    return () => {
      flowAnimation.stop();
      pulseAnimation.stop();
      clearInterval(messageTimer);
    };
  }, [flow, pulse]);

  return (
    <View accessibilityLiveRegion="polite" accessibilityRole="progressbar" style={styles.progressPanel}>
      <View style={styles.progressHeader}>
        <View>
          <Text style={styles.kicker}>Personal Color Scan</Text>
          <Text style={styles.progressMessage}>{diagnosisMessages[messageIndex]}</Text>
        </View>
        <Animated.View style={[styles.statusDot, { opacity: pulse }]} />
      </View>

      <View style={styles.swatchRail}>
        <Animated.View
          style={[
            styles.swatchTrack,
            {
              transform: [
                {
                  translateX: flow.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -180],
                  }),
                },
              ],
            },
          ]}
        >
          {[...swatches, ...swatches].map((color, index) => (
            <View key={`${color}-${index}`} style={[styles.swatch, { backgroundColor: color }]} />
          ))}
        </Animated.View>
      </View>

      <View style={styles.stepRail}>
        {diagnosisMessages.map((message, index) => (
          <View
            key={message}
            style={[
              styles.stepSegment,
              index <= messageIndex ? styles.stepSegmentActive : null,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

export function PersonalColorSwatchAnalysisColumn() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((current) => current + 1);
    }, 720);

    return () => clearInterval(timer);
  }, []);

  const sortedSwatches = analysisSwatches
    .map((swatch, index) => ({
      ...swatch,
      score: getAnalysisScore(swatch.base, swatch.drift, tick, index),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  const leadingScore = sortedSwatches[0]?.score ?? 0;
  const toneBalance = Math.max(0, Math.min(100, 50 + Math.round(Math.sin(tick * 0.64) * 18)));
  const contrastSignal = Math.max(0, Math.min(100, 58 + Math.round(Math.cos(tick * 0.5) * 21)));

  return (
    <View accessibilityLabel="실시간 스와처값 계산" style={styles.analysisPanel}>
      <View style={styles.analysisHeader}>
        <View>
          <Text style={styles.kicker}>Live Swatch Matrix</Text>
          <Text style={styles.analysisTitle}>스와처값 계산</Text>
        </View>
        <View style={styles.analysisBadge}>
          <Text style={styles.analysisBadgeText}>{leadingScore}%</Text>
        </View>
      </View>

      <View style={styles.analysisRows}>
        {sortedSwatches.map((swatch) => (
          <View key={swatch.name} style={styles.analysisRow}>
            <View style={styles.analysisRowHeader}>
              <View style={styles.analysisNameGroup}>
                <View style={[styles.analysisDot, { backgroundColor: swatch.hex }]} />
                <Text style={styles.analysisName} numberOfLines={1}>{swatch.label}</Text>
              </View>
              <Text style={styles.analysisScore}>{swatch.score}%</Text>
            </View>
            <View style={styles.analysisBarTrack}>
              <View style={[styles.analysisBar, { width: `${swatch.score}%` }]} />
            </View>
          </View>
        ))}
      </View>

      <View style={styles.signalGrid}>
        <View style={styles.signalTile}>
          <Text style={styles.signalLabel}>Warm / Cool</Text>
          <Text style={styles.signalValue}>{toneBalance}%</Text>
        </View>
        <View style={styles.signalTile}>
          <Text style={styles.signalLabel}>Contrast</Text>
          <Text style={styles.signalValue}>{contrastSignal}%</Text>
        </View>
      </View>

      <Text style={styles.analysisHelper}>얼굴 톤 기준점과 팔레트 스와치를 동시에 대조하고 있습니다.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: {
    color: colors.accentStrong,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  progressHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressMessage: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 4,
  },
  progressPanel: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.panel,
    borderWidth: 1,
    gap: spacing.sm,
    overflow: "hidden",
    padding: spacing.md,
  },
  analysisBadge: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.control,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  analysisBadgeText: {
    color: colors.accentStrong,
    fontSize: 12,
    fontWeight: "900",
  },
  analysisBar: {
    backgroundColor: colors.accentStrong,
    borderRadius: 999,
    height: "100%",
  },
  analysisBarTrack: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    height: 6,
    overflow: "hidden",
  },
  analysisDot: {
    borderColor: "rgba(0,0,0,0.12)",
    borderRadius: 999,
    borderWidth: 1,
    height: 16,
    width: 16,
  },
  analysisHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  analysisHelper: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  analysisName: {
    color: colors.text,
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
  },
  analysisNameGroup: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 8,
  },
  analysisPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.panel,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  analysisRow: {
    gap: 6,
  },
  analysisRowHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  analysisRows: {
    gap: spacing.sm,
  },
  analysisScore: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
  },
  analysisTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 4,
  },
  scanFrameBottom: {
    borderBottomColor: "rgba(255,255,255,0.72)",
    borderBottomWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.72)",
    borderLeftWidth: 1,
    borderRightColor: "rgba(255,255,255,0.72)",
    borderRightWidth: 1,
    bottom: 22,
    height: 36,
    left: 22,
    position: "absolute",
    right: 22,
  },
  scanFrameTop: {
    borderLeftColor: "rgba(255,255,255,0.72)",
    borderLeftWidth: 1,
    borderRightColor: "rgba(255,255,255,0.72)",
    borderRightWidth: 1,
    borderTopColor: "rgba(255,255,255,0.72)",
    borderTopWidth: 1,
    height: 36,
    left: 22,
    position: "absolute",
    right: 22,
    top: 22,
  },
  scanLine: {
    backgroundColor: "rgba(255,255,255,0.96)",
    height: 3,
    left: 0,
    position: "absolute",
    right: 0,
    shadowColor: "#fff",
    shadowOpacity: 0.85,
    shadowRadius: 14,
    top: 0,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  scanPulse: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  scanTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  signalGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  signalLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  signalTile: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  signalValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 3,
  },
  statusDot: {
    backgroundColor: colors.accentStrong,
    borderRadius: 999,
    height: 12,
    width: 12,
  },
  stepRail: {
    flexDirection: "row",
    gap: 4,
  },
  stepSegment: {
    backgroundColor: colors.border,
    borderRadius: 999,
    flex: 1,
    height: 6,
  },
  stepSegmentActive: {
    backgroundColor: colors.accentStrong,
  },
  swatch: {
    borderColor: "rgba(0,0,0,0.12)",
    borderRadius: radii.control,
    borderWidth: 1,
    height: 38,
    width: 38,
  },
  swatchRail: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  swatchTrack: {
    flexDirection: "row",
    gap: 8,
    width: 760,
  },
});
