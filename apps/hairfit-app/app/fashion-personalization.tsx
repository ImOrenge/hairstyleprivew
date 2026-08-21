import { useAuth } from "@clerk/clerk-expo";
import type { FashionPolicyCoverageV1, UserFashionPersonalizationPolicyV1 } from "@hairfit/shared";
import { BodyText, Button, Card, Chip, Cluster, Heading, Kicker, Panel, Stack } from "@hairfit/ui-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Switch, TextInput, View } from "react-native";
import { AppScreen } from "../components/app/AppScreen";
import { useHairfitApi } from "../lib/api";
import { mapMobileUserError } from "../lib/mobile-user-message";

type State = { policy: UserFashionPersonalizationPolicyV1; coverage: FashionPolicyCoverageV1; learningResetAt: string | null };

function split(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }

export default function FashionPersonalizationScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const api = useHairfitApi();
  const [state, setState] = useState<State | null>(null);
  const [topSize, setTopSize] = useState("");
  const [bottomSize, setBottomSize] = useState("");
  const [fits, setFits] = useState<string[]>([]);
  const [sizeFlexibleOnly, setSizeFlexibleOnly] = useState(false);
  const [fitAny, setFitAny] = useState(false);
  const [constraintsConfirmed, setConstraintsConfirmed] = useState(false);
  const [avoid, setAvoid] = useState("");
  const [sensitivities, setSensitivities] = useState("");
  const [accessibility, setAccessibility] = useState("");
  const [learningConsent, setLearningConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const hydrate = (next: State) => {
    setState(next);
    setTopSize(next.policy.sizeProfile.find((item) => item.category === "top")?.value ?? "");
    setBottomSize(next.policy.sizeProfile.find((item) => item.category === "bottom")?.value ?? "");
    setFits(next.policy.fitPreferences);
    setSizeFlexibleOnly(next.policy.avoidRules.includes("size-flexible-only"));
    setFitAny(next.policy.avoidRules.includes("fit-any"));
    setConstraintsConfirmed(next.policy.avoidRules.includes("constraints-confirmed"));
    setAvoid(next.policy.avoidRules.filter((item) => !["size-flexible-only","fit-any","constraints-confirmed"].includes(item)).join(", "));
    setSensitivities(next.policy.materialSensitivities.join(", "));
    setAccessibility(next.policy.accessibilityNeeds.join(", "));
    setLearningConsent(next.policy.learningConsent);
  };

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace("/login");
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    setBusy(true);
    void api.getFashionPersonalizationPolicy()
      .then((result) => { if (active) hydrate(result); })
      .catch((error) => { if (active) setMessage(mapMobileUserError(error, "패션 개인화 설정을 불러오지 못했습니다.")); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [api, isSignedIn]);

  const save = async () => {
    if (!state) return;
    setBusy(true); setMessage(null);
    try {
      const next = await api.patchFashionPersonalizationPolicy(state.policy.revision, {
        sizeProfile: [
          ...(topSize.trim() ? [{ category: "top", system: "KR", value: topSize.trim(), source: "user-entered" }] : []),
          ...(bottomSize.trim() ? [{ category: "bottom", system: "KR", value: bottomSize.trim(), source: "user-entered" }] : []),
        ],
        sizeFlexibleOnly, fitPreferences: fits, fitAny, avoidRules: split(avoid),
        materialSensitivities: split(sensitivities), accessibilityNeeds: split(accessibility),
        constraintsConfirmed, learningConsent,
      });
      hydrate(next); setMessage("패션 개인화 기준을 저장했습니다.");
    } catch (error) { setMessage(mapMobileUserError(error, "패션 개인화 기준을 저장하지 못했습니다.")); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!state) return;
    setBusy(true); setMessage(null);
    try {
      const next = await api.confirmFashionPersonalizationPolicy(state.policy.revision);
      hydrate(next); setMessage("패션 개인화 준비가 완료되었습니다.");
    } catch (error) { setMessage(mapMobileUserError(error, "패션 개인화 기준을 확정하지 못했습니다.")); }
    finally { setBusy(false); }
  };

  const reset = async () => {
    setBusy(true); setMessage(null);
    try {
      const next = await api.resetFashionPersonalizationLearning();
      hydrate(next); setMessage("미래 추천의 학습 기준을 초기화했습니다. 과거 결과는 유지됩니다.");
    } catch (error) { setMessage(mapMobileUserError(error, "학습 기준을 초기화하지 못했습니다.")); }
    finally { setBusy(false); }
  };

  return <AppScreen>
    <Stack>
      <Kicker>Persistent fashion policy</Kicker>
      <Heading>패션 개인화 기준</Heading>
      <BodyText>지속 기준만 저장합니다. 사진으로 사이즈·성별·체중·접근성 조건을 추론하지 않습니다.</BodyText>
      {state ? <Cluster>
        <Chip>{state.policy.styleTarget || "타깃 미설정"}</Chip>
        <Chip>revision {state.policy.revision}</Chip>
        <Chip>{state.policy.confirmedRevision === state.policy.revision ? "확정됨" : state.coverage.complete ? "확정 가능" : "입력 필요"}</Chip>
      </Cluster> : null}

      <Panel>
        <Stack>
          <Heading style={styles.sectionHeading}>사이즈와 핏</Heading>
          <TextInput accessibilityLabel="상의 사이즈" placeholder="상의 사이즈 95, 100, M" placeholderTextColor="#8c8880" style={styles.input} value={topSize} editable={!sizeFlexibleOnly} onChangeText={setTopSize} />
          <TextInput accessibilityLabel="하의 사이즈" placeholder="하의 사이즈 28, 30, M" placeholderTextColor="#8c8880" style={styles.input} value={bottomSize} editable={!sizeFlexibleOnly} onChangeText={setBottomSize} />
          <View style={styles.switchRow}><BodyText>사이즈 무관 추천만</BodyText><Switch value={sizeFlexibleOnly} onValueChange={setSizeFlexibleOnly} /></View>
          <Cluster>{["slim","regular","relaxed","oversized"].map((fit) => <Button key={fit} variant={fits.includes(fit) ? "primary" : "secondary"} onPress={() => { setFitAny(false); setFits((current) => current.includes(fit) ? current.filter((item) => item !== fit) : [...current, fit]); }}>{fit}</Button>)}</Cluster>
          <View style={styles.switchRow}><BodyText>핏은 상관없음</BodyText><Switch value={fitAny} onValueChange={(value) => { setFitAny(value); if (value) setFits([]); }} /></View>
        </Stack>
      </Panel>

      <Panel>
        <Stack>
          <Heading style={styles.sectionHeading}>금지·민감도·접근성</Heading>
          <TextInput accessibilityLabel="피하고 싶은 것" placeholder="피하고 싶은 품목과 색" placeholderTextColor="#8c8880" style={styles.input} value={avoid} onChangeText={setAvoid} />
          <TextInput accessibilityLabel="민감 소재" placeholder="민감 소재" placeholderTextColor="#8c8880" style={styles.input} value={sensitivities} onChangeText={setSensitivities} />
          <TextInput accessibilityLabel="접근성 조건" placeholder="착탈과 접근성 조건" placeholderTextColor="#8c8880" style={styles.input} value={accessibility} onChangeText={setAccessibility} />
          <View style={styles.switchRow}><BodyText>조건을 모두 확인했습니다</BodyText><Switch value={constraintsConfirmed} onValueChange={setConstraintsConfirmed} /></View>
        </Stack>
      </Panel>

      <Card>
        <Stack>
          <Heading style={styles.sectionHeading}>학습 선택</Heading>
          <View style={styles.switchRow}><BodyText>명시적 피드백을 미래 추천에 사용</BodyText><Switch value={learningConsent} onValueChange={setLearningConsent} /></View>
          <Button variant="secondary" disabled={busy} onPress={() => void reset()}>개인화 학습 초기화</Button>
        </Stack>
      </Card>

      {message ? <View accessibilityLiveRegion="polite"><BodyText>{message}</BodyText></View> : null}
      <Cluster>
        <Button disabled={busy || !state} onPress={() => void save()}>{busy ? "처리 중" : "설정 저장"}</Button>
        <Button variant="secondary" disabled={busy || !state?.coverage.complete || state.policy.confirmedRevision === state.policy.revision} onPress={() => void confirm()}>기준 확정</Button>
        <Button variant="secondary" onPress={() => router.back()}>돌아가기</Button>
      </Cluster>
    </Stack>
  </AppScreen>;
}

const styles = StyleSheet.create({
  sectionHeading: { fontSize: 20, lineHeight: 26 },
  input: { minHeight: 48, borderWidth: 1, borderColor: "#5b564d", color: "#f7f1e6", paddingHorizontal: 14, paddingVertical: 10 },
  switchRow: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
});
