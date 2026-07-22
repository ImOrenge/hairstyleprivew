import type { PersonalColorResult, PersonalColorSwatch } from "@hairfit/shared";
import { BodyText, Card, Cluster, Heading, Kicker, Stack } from "@hairfit/ui-native";
import { StyleSheet, View } from "react-native";

export function hasDetailedPersonalColorResult(result: PersonalColorResult | null | undefined) {
  return result?.detailVersion === "color-detail-v1";
}

function formatPersonalColor(result: PersonalColorResult) {
  const tone = result.tone === "warm" ? "웜톤" : result.tone === "cool" ? "쿨톤" : "뉴트럴";
  const contrast =
    result.contrast === "high" ? "높은 대비" : result.contrast === "low" ? "낮은 대비" : "중간 대비";
  return `${tone} / ${contrast}`;
}

function SwatchChip({ swatch }: { swatch: PersonalColorSwatch }) {
  return (
    <View style={styles.swatchChip}>
      <View style={[styles.swatchDot, { backgroundColor: swatch.hex }]} />
      <BodyText style={styles.swatchText}>{swatch.nameKo}</BodyText>
    </View>
  );
}

function SimpleSwatchList({ colors }: { colors: PersonalColorSwatch[] }) {
  if (!colors.length) {
    return <BodyText>저장된 색상이 없습니다.</BodyText>;
  }

  return (
    <Cluster>
      {colors.slice(0, 6).map((swatch) => (
        <SwatchChip key={`${swatch.nameEn}-${swatch.hex}`} swatch={swatch} />
      ))}
    </Cluster>
  );
}

function DetailLine({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return null;
  }

  return (
    <Stack gap={4}>
      <Kicker>{label}</Kicker>
      <BodyText>{value}</BodyText>
    </Stack>
  );
}

function ColorCombinations({ swatch }: { swatch: PersonalColorSwatch }) {
  if (!swatch.colorCombinations?.length) {
    return null;
  }

  return (
    <Stack gap={8}>
      <Kicker>컬러 조합</Kicker>
      {swatch.colorCombinations.map((combination, index) => (
        <View key={`${swatch.hex}-${combination.title}-${index}`} style={styles.combinationBox}>
          <Cluster gap={8}>
            <BodyText style={styles.strongText}>{combination.title}</BodyText>
            <View style={styles.paletteStrip}>
              {combination.hexes.map((hex) => (
                <View key={`${combination.title}-${hex}`} style={[styles.paletteBlock, { backgroundColor: hex }]} />
              ))}
            </View>
          </Cluster>
          <BodyText>{combination.reason}</BodyText>
        </View>
      ))}
    </Stack>
  );
}

function ColorDetailCard({ swatch }: { swatch: PersonalColorSwatch }) {
  return (
    <Card>
      <Stack gap={12}>
        <Cluster gap={10}>
          <View style={[styles.detailDot, { backgroundColor: swatch.hex }]} />
          <Stack gap={2} style={{ flex: 1 }}>
            <Heading style={styles.colorHeading}>{swatch.nameKo}</Heading>
            <BodyText>{swatch.nameEn} · {swatch.hex}</BodyText>
          </Stack>
        </Cluster>
        <DetailLine label="추천 근거" value={swatch.recommendationReason || swatch.reason} />
        <DetailLine label="비추천 근거" value={swatch.nonRecommendationReason} />
        <DetailLine label="색상의 의미" value={swatch.meaning} />
        <DetailLine label="스타일링 팁" value={swatch.stylingTip} />
        <ColorCombinations swatch={swatch} />
      </Stack>
    </Card>
  );
}

function DetailSection({ colors, title }: { colors: PersonalColorSwatch[]; title: string }) {
  return (
    <Stack>
      <Heading style={styles.sectionHeading}>{title}</Heading>
      {colors.map((swatch) => (
        <ColorDetailCard key={`${title}-${swatch.nameEn}-${swatch.hex}`} swatch={swatch} />
      ))}
    </Stack>
  );
}

export function PersonalColorResultDetails({ result }: { result: PersonalColorResult }) {
  const hasDetails = hasDetailedPersonalColorResult(result);

  return (
    <Stack>
      <Card>
        <Stack gap={8}>
          <Kicker>퍼스널컬러 결과</Kicker>
          <Heading>{formatPersonalColor(result)}</Heading>
          <BodyText>{result.summary}</BodyText>
          <BodyText>신뢰도 {Math.round(result.confidence * 100)}%</BodyText>
        </Stack>
      </Card>

      {!hasDetails ? (
        <Card>
          <Stack>
            <BodyText style={styles.strongText}>
              이 결과는 이전 버전 진단입니다. 색상별 추천근거, 비추천근거, 컬러조합, 색상의 의미는 새로 진단하면 제공됩니다.
            </BodyText>
            <Kicker>추천 색상</Kicker>
            <SimpleSwatchList colors={result.bestColors} />
            <Kicker>주의 색상</Kicker>
            <SimpleSwatchList colors={result.avoidColors} />
          </Stack>
        </Card>
      ) : (
        <Stack>
          <DetailSection title="추천 색상 상세" colors={result.bestColors} />
          <DetailSection title="주의 색상 상세" colors={result.avoidColors} />
        </Stack>
      )}

      {result.hairColorHints.length ? (
        <Card>
          <Stack>
            <Kicker>헤어 컬러 힌트</Kicker>
            <Cluster>
              {result.hairColorHints.map((hint) => (
                <View key={hint} style={styles.hintChip}>
                  <BodyText style={styles.hintText}>{hint}</BodyText>
                </View>
              ))}
            </Cluster>
          </Stack>
        </Card>
      ) : null}
    </Stack>
  );
}

const styles = StyleSheet.create({
  colorHeading: {
    fontSize: 18,
    lineHeight: 24,
  },
  combinationBox: {
    borderColor: "rgba(0,0,0,0.12)",
    borderWidth: 1,
    gap: 6,
    padding: 10,
  },
  detailDot: {
    borderColor: "rgba(0,0,0,0.12)",
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    width: 34,
  },
  hintChip: {
    backgroundColor: "#fffdf8",
    borderColor: "#ded6ca",
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  hintText: {
    color: "#181411",
    fontSize: 12,
    fontWeight: "800",
  },
  paletteBlock: {
    height: 18,
    width: 24,
  },
  paletteStrip: {
    borderColor: "rgba(0,0,0,0.12)",
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  sectionHeading: {
    fontSize: 20,
    lineHeight: 26,
  },
  strongText: {
    color: "#f4f1e8",
    fontWeight: "800",
  },
  swatchChip: {
    alignItems: "center",
    backgroundColor: "#fffdf8",
    borderColor: "#ded6ca",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  swatchDot: {
    borderColor: "rgba(0,0,0,0.12)",
    borderRadius: 999,
    borderWidth: 1,
    height: 16,
    width: 16,
  },
  swatchText: {
    color: "#181411",
    fontSize: 12,
    fontWeight: "800",
  },
});
