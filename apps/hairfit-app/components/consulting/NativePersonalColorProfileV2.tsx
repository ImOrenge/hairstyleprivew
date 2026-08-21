import type { PersonalColorProfileV2 } from "@hairfit/shared";
import { BodyText, Button, Card, Chip, Cluster, Heading, Kicker, Stack } from "@hairfit/ui-native";
import { StyleSheet, View } from "react-native";

const AXIS_LABELS: Record<keyof PersonalColorProfileV2["axes"], string> = { temperature: "온도", value: "명도", chroma: "채도", contrast: "대비", hueCharacter: "색상 성격" };

export function NativePersonalColorProfileV2({ profile, trainingConsent, onTrainingConsentChange }: { profile: PersonalColorProfileV2; trainingConsent: boolean; onTrainingConsentChange: (granted: boolean) => void }) {
  const top = [...profile.seasonalPosterior].sort((a, b) => b.probability - a.probability).slice(0, 3);
  return <View><Card>
    <Stack>
      <Kicker>Color profile V2</Kicker>
      <Heading>관찰과 추론을 분리한 퍼스널 컬러</Heading>
      <Cluster><Chip>프로필 {Math.round(profile.confidence.overall * 100)}%</Chip><Chip>{profile.captureMode}</Chip><Chip>{profile.calibration.version}</Chip></Cluster>
      {(Object.entries(profile.axes) as [keyof PersonalColorProfileV2["axes"], PersonalColorProfileV2["axes"][keyof PersonalColorProfileV2["axes"]]][]).map(([key, axis]) => <View key={key} accessible accessibilityLabel={`${AXIS_LABELS[key]} ${axis.value === null ? `측정 보류 ${axis.unavailableReason}` : `${Math.round(axis.value * 100)}, 신뢰도 ${Math.round(axis.confidence * 100)}퍼센트`}`} style={styles.axisRow}>
        <BodyText>{AXIS_LABELS[key]}</BodyText><BodyText>{axis.value === null ? "측정 보류" : `${Math.round(axis.value * 100)} · 신뢰도 ${Math.round(axis.confidence * 100)}%`}</BodyText>
      </View>)}
      <Kicker>12-type posterior · 상위 3개</Kicker>
      {top.map((item) => <View key={item.type} accessible accessibilityLabel={`${item.type} ${Math.round(item.probability * 100)}퍼센트`} style={styles.axisRow}><BodyText>{item.type}</BodyText><BodyText>{Math.round(item.probability * 100)}%</BodyText></View>)}
      <BodyText>보정 {profile.calibration.version} · 영역 {profile.regions.map((region) => `${region.region} ${Math.round(region.validPixelRatio * 100)}%`).join(" · ")}</BodyText>
      <Kicker>Optional training consent</Kicker>
      <BodyText>진단 이용과 별개이며 동의하지 않아도 서비스는 동일합니다. 동의만으로 원본 사진이 학습 데이터에 복사되지 않습니다.</BodyText>
      <Button variant={trainingConsent ? "primary" : "secondary"} accessibilityState={{ checked: trainingConsent }} onPress={() => onTrainingConsentChange(!trainingConsent)}>{trainingConsent ? "선택 학습 동의 철회" : "선택 학습 동의하기"}</Button>
    </Stack>
  </Card></View>;
}

const styles = StyleSheet.create({ axisRow: { alignItems: "center", borderBottomColor: "#34322c", borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 44 } });
