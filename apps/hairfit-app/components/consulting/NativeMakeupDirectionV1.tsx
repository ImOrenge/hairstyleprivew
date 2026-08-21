import type { MakeupArtistBrief, MakeupContextProfile, MakeupDirectionSnapshot, MakeupModule, MakeupRoutine } from "@hairfit/shared";
import { BodyText, Button, Card, Chip, Cluster, Heading, Kicker, Stack } from "@hairfit/ui-native";
import { StyleSheet, View } from "react-native";

const LABELS: Record<MakeupModule, string> = { base: "베이스", brow: "눈썹", eyeshadow: "아이섀도", eyeliner: "아이라인", blush: "블러셔", lip: "립", lashes: "속눈썹" };
const COLORS: Record<MakeupModule, string> = { base: "#d0b06a", brow: "#72533d", eyeshadow: "#a07b65", eyeliner: "#302722", blush: "#d77d83", lip: "#b85d68", lashes: "#40342c" };

export function NativeMakeupDirectionV1({ snapshot, defaultContext, revision, routine, brief, onPrepare, onToggleModule, onConfirm }: {
  snapshot: MakeupDirectionSnapshot | null;
  defaultContext: MakeupContextProfile;
  revision: number | null;
  routine: MakeupRoutine | null;
  brief: MakeupArtistBrief | null;
  onPrepare: (context: MakeupContextProfile) => void;
  onToggleModule: (module: MakeupModule, enabled: boolean) => void;
  onConfirm: () => void;
}) {
  if (!snapshot) return <Card><Stack><Kicker>Makeup direction</Kicker><Heading>7개 존 처방 준비</Heading><BodyText>확정 헤어, Personal Color, 실제 얼굴 좌표로 메이크업 방향을 만듭니다. 얼굴 픽셀은 바꾸지 않습니다.</BodyText><Button onPress={() => onPrepare(defaultContext)}>기본 컨텍스트로 7개 존 만들기</Button></Stack></Card>;
  const confirmed = ["confirmed", "routine_ready", "brief_ready"].includes(snapshot.status);
  return <View><Card>
    <Stack>
      <Kicker>Interactive face map · revision {revision ?? 0}</Kicker>
      <Heading>7개 존 위치와 방향</Heading>
      <View accessible accessibilityLabel="정규화된 4대5 얼굴 좌표 지도" style={styles.map}>{snapshot.modules.map((item) => item.geometry.anchors[0] ? <View key={item.module} accessibilityLabel={`${LABELS[item.module]} 기준점`} style={[styles.anchor, { backgroundColor: COLORS[item.module], left: `${Math.round(item.geometry.anchors[0].x * 100)}%`, top: `${Math.round(item.geometry.anchors[0].y * 100)}%` }]} /> : null)}</View>
      {snapshot.modules.map((item) => <View key={item.module} style={styles.moduleRow} accessible accessibilityLabel={`${LABELS[item.module]}, ${item.state}, 강도 ${Math.round(item.direction.intensity * 100)}퍼센트, ${item.direction.colorFamily ?? "색상 미정"}, ${item.direction.technical.placement.join(", ")}`}>
        <View style={styles.moduleCopy}><BodyText>{LABELS[item.module]} · {item.state === "enabled" ? "사용" : "OFF"}</BodyText><BodyText>{Math.round(item.direction.intensity * 100)}% · {item.direction.colorFamily ?? "색상 미정"} · {item.direction.texture ?? "질감 미정"}</BodyText><BodyText>{item.direction.technical.placement.join(" · ")}</BodyText></View>
        {!confirmed ? <Button variant="secondary" onPress={() => onToggleModule(item.module, item.state !== "enabled")}>{item.state === "enabled" ? "OFF" : "사용"}</Button> : null}
      </View>)}
      {!confirmed ? <Button onPress={onConfirm}>이 메이크업 방향 확정</Button> : <Cluster><Chip tone="success">확정</Chip><Chip>{snapshot.source.personalColorProfileId}</Chip></Cluster>}
      {routine ? <><Kicker>Self makeup · {Math.ceil(routine.estimatedSeconds / 60)}분 이내</Kicker>{routine.steps.map((step) => <BodyText key={`${step.order}-${step.module}`}>{step.order}. {LABELS[step.module]} · {step.estimatedSeconds}초 · {step.instruction}</BodyText>)}</> : null}
      {brief ? <><Kicker>Artist handoff</Kicker><BodyText>{brief.moduleSummaries.filter((item) => item.enabled).map((item) => LABELS[item.module]).join(" · ")}</BodyText><BodyText>원본 사진 포함: 아니요</BodyText></> : null}
    </Stack>
  </Card></View>;
}

const styles = StyleSheet.create({
  anchor: { borderColor: "#fff", borderRadius: 7, borderWidth: 2, height: 14, marginLeft: -7, marginTop: -7, position: "absolute", width: 14 },
  map: { aspectRatio: 4 / 5, backgroundColor: "#eee8de", borderColor: "#34322c", borderWidth: 1, overflow: "hidden", width: "100%" },
  moduleCopy: { flex: 1, gap: 2 },
  moduleRow: { alignItems: "center", borderTopColor: "#34322c", borderTopWidth: 1, flexDirection: "row", gap: 8, minHeight: 64, paddingVertical: 8 },
});
