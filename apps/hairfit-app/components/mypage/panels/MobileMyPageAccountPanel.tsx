import { useAuth, useUser } from "@clerk/clerk-expo";
import type {
  AccountSetupContinuation,
  MemberStyleTarget,
  MemberStyleTone,
  MobileBootstrap,
} from "@hairfit/shared";
import { getGenerationContinuationPath } from "@hairfit/shared";
import {
  BodyText,
  Button,
  Card,
  Cluster,
  Heading,
  Kicker,
  Panel,
  Stack,
  TextField,
} from "@hairfit/ui-native";
import { type Href, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { useHairfitApi } from "../../../lib/api";
import { signOutAndClearAuthResume } from "../../../lib/auth-resume";
import { mapMobileUserError } from "../../../lib/mobile-user-message";
import {
  formatMobileAccountSetup as accountSetupLabel,
  formatMobileAccountType as accountTypeLabel,
  formatMobileMyPagePlanLabel as formatPlanLabel,
  formatMobileService as serviceLabel,
  getMobileDisplayName as displayName,
} from "../../../lib/mypage";
import { MobileMyPageAsyncBoundary } from "../MobileMyPageAsyncBoundary";
import { MobileAccountDeletionPanel } from "../MobileAccountDeletionPanel";

const genderOptions: { value: MemberStyleTarget; label: string }[] = [
  { value: "male", label: "남성" },
  { value: "female", label: "여성" },
];

const toneOptions: { value: MemberStyleTone; label: string }[] = [
  { value: "natural", label: "내추럴" },
  { value: "trendy", label: "트렌디" },
  { value: "soft", label: "소프트" },
  { value: "bold", label: "볼드" },
];

export function MobileMyPageAccountPanel({
  continuation,
  me,
  onSaved,
}: {
  continuation: AccountSetupContinuation | null;
  me: MobileBootstrap | null;
  onSaved: (next: MobileBootstrap) => void;
}) {
  const api = useHairfitApi();
  const router = useRouter();
  const { signOut, userId } = useAuth();
  const { user } = useUser();
  const initialDisplayName = me?.displayName?.trim() || "";
  const [styleTarget, setStyleTarget] = useState<MemberStyleTarget | null>(me?.styleTarget ?? null);
  const [displayNameValue, setDisplayNameValue] = useState(initialDisplayName);
  const [preferredStyleTone, setPreferredStyleTone] = useState<MemberStyleTone>(me?.preferredStyleTone ?? "natural");
  const [pending, setPending] = useState(false);
  const [signOutPending, setSignOutPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const clerkEmail =
    user?.primaryEmailAddress?.emailAddress?.trim() ||
    user?.emailAddresses?.[0]?.emailAddress?.trim() ||
    null;
  const clerkDisplayName = user?.fullName?.trim() || user?.firstName?.trim() || user?.username?.trim() || null;
  const accountName = me ? displayName(me) : clerkDisplayName || "HairFit 사용자";
  const accountEmail = me?.email || clerkEmail || "-";
  const services = me?.services?.length ? me.services.map(serviceLabel).join(", ") : "-";
  const accountRows = [
    { label: "이름", value: accountName },
    { label: "이메일", value: accountEmail },
    { label: "계정 유형", value: accountTypeLabel(me?.accountType ?? null) },
    { label: "계정 설정", value: accountSetupLabel(me?.accountSetupComplete) },
    { label: "플랜", value: formatPlanLabel(me?.planKey) },
    { label: "크레딧", value: (me?.credits ?? 0).toLocaleString("ko-KR") },
    { label: "서비스", value: services },
    { label: "사용자 ID", value: me?.userId || userId || "-" },
  ];

  useEffect(() => {
    setDisplayNameValue(me?.displayName?.trim() || "");
    setStyleTarget(me?.styleTarget ?? null);
    setPreferredStyleTone(me?.preferredStyleTone ?? "natural");
  }, [me?.displayName, me?.preferredStyleTone, me?.styleTarget]);

  const saveAccountSetup = async () => {
    const displayName = displayNameValue.trim();
    if (!displayName || !styleTarget || pending) return;
    setPending(true);
    setMessage(null);

    try {
      const result = await api.saveAccountSetup({
        displayName,
        styleTarget,
        preferredStyleTone,
      });
      const nextMe = await api.getMobileMe();
      onSaved(nextMe);
      setDisplayNameValue(result.profile.displayName);
      setStyleTarget(result.profile.styleTarget);
      setPreferredStyleTone(result.profile.preferredStyleTone);
      if (continuation) {
        setMessage("계정 설정이 저장되었습니다. 생성 화면으로 돌아갑니다.");
        router.replace(getGenerationContinuationPath(continuation, "native") as Href);
      } else {
        setMessage("계정 설정이 저장되었습니다.");
      }
    } catch (error) {
      setMessage(mapMobileUserError(error, "계정 설정 저장에 실패했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      setPending(false);
    }
  };

  const handleSignOut = async () => {
    if (signOutPending) return;
    setSignOutPending(true);
    setMessage(null);

    try {
      await signOutAndClearAuthResume(signOut);
      router.replace("/login");
    } catch (error) {
      setMessage(mapMobileUserError(error, "로그아웃에 실패했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      setSignOutPending(false);
    }
  };

  return (
    <MobileMyPageAsyncBoundary>
      <Panel>
      <Stack>
        <Heading style={styles.panelHeading}>계정</Heading>
        <BodyText>로그인된 고객 계정 정보와 로그아웃을 여기에서 관리하세요.</BodyText>
        <Card>
          <Stack gap={12}>
            <Kicker>계정 정보</Kicker>
            {accountRows.map((row) => (
              <Stack key={row.label} gap={4}>
                <BodyText style={styles.infoLabel}>{row.label}</BodyText>
                <BodyText style={styles.infoValue}>{row.value}</BodyText>
              </Stack>
            ))}
            <Button variant="secondary" disabled={signOutPending} onPress={handleSignOut}>
              {signOutPending ? "로그아웃 중..." : "로그아웃"}
            </Button>
            <Button variant="secondary" onPress={() => router.push("/salon/connections")}>
              살롱 연결과 동의 관리
            </Button>
          </Stack>
        </Card>
        <Card>
          <Stack gap={10}>
            <Kicker>계정 설정</Kicker>
            <BodyText>닉네임, 성별, 선호 톤을 저장하면 헤어 생성과 스타일 추천을 사용할 수 있습니다.</BodyText>
            <TextField
              label="닉네임"
              onChangeText={setDisplayNameValue}
              placeholder="닉네임"
              value={displayNameValue}
            />
            <BodyText style={styles.infoLabel}>성별</BodyText>
            <Cluster>
              {genderOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={styleTarget === option.value ? "primary" : "secondary"}
                  onPress={() => setStyleTarget(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </Cluster>
            <BodyText style={styles.infoLabel}>선호 톤</BodyText>
            <Cluster>
              {toneOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={preferredStyleTone === option.value ? "primary" : "secondary"}
                  onPress={() => setPreferredStyleTone(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </Cluster>
            <Button disabled={!displayNameValue.trim() || !styleTarget || pending} onPress={saveAccountSetup}>
              {pending ? "저장 중..." : "계정 설정 저장"}
            </Button>
            {message ? <BodyText>{message}</BodyText> : null}
          </Stack>
        </Card>
        <MobileAccountDeletionPanel />
      </Stack>
      </Panel>
    </MobileMyPageAsyncBoundary>
  );
}

const styles = StyleSheet.create({
  panelHeading: {
    fontSize: 22,
    lineHeight: 28,
  },
  infoLabel: {
    color: "#d0b06a",
    fontSize: 12,
    fontWeight: "900",
  },
  infoValue: {
    color: "#f4f1e8",
    fontWeight: "800",
  },
});
