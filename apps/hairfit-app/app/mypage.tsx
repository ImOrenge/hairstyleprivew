import { useAuth, useUser } from "@clerk/clerk-expo";
import type {
  MemberStyleTarget,
  MemberStyleTone,
  MobileBootstrap,
  MobileDashboard,
  PersonalColorResult,
  StyleProfile,
} from "@hairfit/shared";
import {
  BodyText,
  Button,
  Card,
  Chip,
  Cluster,
  Divider,
  Heading,
  Kicker,
  MetricGrid,
  MetricTile,
  Panel,
  Screen,
  Stack,
  TextField,
} from "@hairfit/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { PersonalColorResultDetails } from "../components/PersonalColorResultDetails";
import { useHairfitApi } from "../lib/api";

const genderOptions: Array<{ value: MemberStyleTarget; label: string }> = [
  { value: "male", label: "남성" },
  { value: "female", label: "여성" },
];

const toneOptions: Array<{ value: MemberStyleTone; label: string }> = [
  { value: "natural", label: "내추럴" },
  { value: "trendy", label: "트렌디" },
  { value: "soft", label: "소프트" },
  { value: "bold", label: "볼드" },
];

type MyPageTabId = "usage" | "plan" | "aftercare" | "personal-color" | "body-profile" | "account";

const tabIds: MyPageTabId[] = ["usage", "plan", "aftercare", "personal-color", "body-profile", "account"];

const tabs: Array<{ id: MyPageTabId; label: string }> = [
  { id: "usage", label: "사용기록" },
  { id: "plan", label: "플랜/결제" },
  { id: "aftercare", label: "에프터케어" },
  { id: "personal-color", label: "퍼스널컬러" },
  { id: "body-profile", label: "바디프로필" },
  { id: "account", label: "계정" },
];

function normalizeTab(value: unknown): MyPageTabId {
  const first = Array.isArray(value) ? value[0] : value;
  return tabIds.includes(first as MyPageTabId) ? (first as MyPageTabId) : "usage";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatKrw(value: number) {
  return `${value.toLocaleString("ko-KR")} KRW`;
}

function formatPlanLabel(planKey: string | null | undefined) {
  if (!planKey) return "무료";
  if (planKey === "free") return "무료";
  if (planKey === "starter") return "스타터";
  if (planKey === "pro") return "프로";
  return planKey.charAt(0).toUpperCase() + planKey.slice(1);
}

function accountTypeLabel(accountType: MobileBootstrap["accountType"]) {
  if (accountType === "admin") return "관리자";
  if (accountType === "salon_owner") return "살롱 관리자";
  if (accountType === "member") return "고객";
  return "미설정";
}

function serviceLabel(service: MobileBootstrap["services"][number]) {
  if (service === "admin") return "관리";
  if (service === "salon") return "살롱";
  return "고객";
}

function accountSetupLabel(value: boolean | null | undefined) {
  return value ? "완료" : "미완료";
}

function statusLabel(value: string | null | undefined) {
  const status = value?.toLowerCase();
  if (status === "completed") return "완료";
  if (status === "failed" || status === "error") return "실패";
  if (status === "processing" || status === "running") return "생성 중";
  if (status === "queued" || status === "pending") return "대기 중";
  return value || "상태 확인 중";
}

function displayName(me: MobileBootstrap | null) {
  const name = me?.displayName?.trim();
  if (name) return name;
  const emailName = me?.email?.split("@")[0]?.trim();
  return emailName || "HairFit 사용자";
}

function formatPersonalColor(result: PersonalColorResult | null | undefined) {
  if (!result) return "진단 없음";
  const tone = result.tone === "warm" ? "웜톤" : result.tone === "cool" ? "쿨톤" : "뉴트럴";
  const contrast =
    result.contrast === "high" ? "높은 대비" : result.contrast === "low" ? "낮은 대비" : "중간 대비";
  return `${tone} / ${contrast}`;
}

function TabNavigation({ activeTab }: { activeTab: MyPageTabId }) {
  const router = useRouter();

  return (
    <Panel style={styles.tabPanel}>
      <ScrollView
        horizontal
        contentContainerStyle={styles.tabScrollerContent}
        showsHorizontalScrollIndicator={false}
      >
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? "primary" : "secondary"}
            onPress={() => router.push(`/mypage?tab=${tab.id}`)}
          >
            {tab.label}
          </Button>
        ))}
      </ScrollView>
    </Panel>
  );
}

function UsagePanel({
  generations,
}: {
  generations: Extract<MobileDashboard, { service: "customer" }>["customer"]["recentGenerations"];
}) {
  const router = useRouter();

  return (
    <Panel>
      <Stack>
        <Heading style={styles.panelHeading}>최근 사용기록</Heading>
        <BodyText>최근 헤어 생성 기록과 현재 처리 상태입니다.</BodyText>
        {generations.length === 0 ? (
          <Card style={{ borderStyle: "dashed", paddingVertical: 28 }}>
            <Stack gap={8}>
              <BodyText style={styles.centerStrong}>아직 생성 기록이 없습니다.</BodyText>
              <BodyText style={styles.centerText}>워크스페이스에서 첫 보드를 만들면 여기에 표시됩니다.</BodyText>
            </Stack>
          </Card>
        ) : (
          generations.map((item) => (
            <Card key={item.id}>
              <Stack gap={10}>
                <Cluster>
                  <Chip tone={item.status === "completed" ? "success" : "neutral"}>{statusLabel(item.status)}</Chip>
                  <Chip>{formatDate(item.createdAt)}</Chip>
                </Cluster>
                <BodyText style={styles.strongText}>{item.promptUsed || "제목 없는 생성 결과"}</BodyText>
                <BodyText>{item.id}</BodyText>
                <Button variant="secondary" onPress={() => router.push(`/result/${item.id}`)}>
                  열기
                </Button>
              </Stack>
            </Card>
          ))
        )}
      </Stack>
    </Panel>
  );
}

function PlanPanel({
  activePlan,
  payments,
}: {
  activePlan: string;
  payments: Extract<MobileDashboard, { service: "customer" }>["customer"]["recentPayments"];
}) {
  return (
    <Panel>
      <Stack>
        <Heading style={styles.panelHeading}>플랜 및 결제</Heading>
        <BodyText>현재 플랜과 최근 결제 내역입니다.</BodyText>
        <Card>
          <BodyText>활성 플랜</BodyText>
          <Heading>{activePlan}</Heading>
        </Card>
        {payments.length === 0 ? (
          <Card style={{ borderStyle: "dashed" }}>
            <BodyText>결제 기록이 없습니다.</BodyText>
          </Card>
        ) : (
          payments.map((payment) => (
            <Card key={payment.id}>
              <BodyText style={styles.strongText}>{formatKrw(payment.amountKrw)}</BodyText>
              <BodyText>
                {payment.status} / {payment.creditsToGrant.toLocaleString("ko-KR")} 크레딧
              </BodyText>
              <BodyText>{formatDate(payment.paidAt ?? payment.createdAt)}</BodyText>
            </Card>
          ))
        )}
      </Stack>
    </Panel>
  );
}

function AftercarePanel() {
  const router = useRouter();

  return (
    <Panel>
      <Stack>
        <Heading style={styles.panelHeading}>에프터케어</Heading>
        <BodyText>최근 확정한 헤어 시술 기록입니다.</BodyText>
        <Card style={{ borderStyle: "dashed" }}>
          <BodyText>아직 에프터케어 기록이 없습니다.</BodyText>
        </Card>
        <Button variant="secondary" onPress={() => router.push("/aftercare")}>
          에프터케어 보기
        </Button>
      </Stack>
    </Panel>
  );
}

function BodyProfilePanel() {
  const api = useHairfitApi();
  const router = useRouter();
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setIsLoadingProfile(true);
      try {
        const result = await api.getStyleProfile();
        if (!cancelled) {
          setProfile(result.profile);
          setMessage(null);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "바디프로필을 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingProfile(false);
        }
      }
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const personalColor = profile?.personalColor ?? null;

  return (
    <Panel>
      <Stack>
        <Heading style={styles.panelHeading}>바디프로필 설정</Heading>
        <BodyText>저장된 체형 정보와 참고 사진은 패션 추천에 사용됩니다.</BodyText>
        {isLoadingProfile ? <BodyText>바디 프로필을 불러오는 중입니다...</BodyText> : null}
        {message ? <BodyText>{message}</BodyText> : null}
        <Card>
          <Stack>
            <Kicker>Personal Color</Kicker>
            <Heading style={{ fontSize: 20, lineHeight: 26 }}>{formatPersonalColor(personalColor)}</Heading>
            <BodyText>
              {personalColor?.summary || "선명한 얼굴 사진을 업로드해 스타일링에 사용할 퍼스널 컬러 정보를 저장하세요."}
            </BodyText>
            <Button onPress={() => router.push("/mypage?tab=personal-color")}>
              퍼스널컬러 탭 보기
            </Button>
          </Stack>
        </Card>
      </Stack>
    </Panel>
  );
}

function PersonalColorPanel() {
  const api = useHairfitApi();
  const router = useRouter();
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setIsLoadingProfile(true);
      try {
        const result = await api.getStyleProfile();
        if (!cancelled) {
          setProfile(result.profile);
          setMessage(null);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "퍼스널 컬러 결과를 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingProfile(false);
        }
      }
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const personalColor = profile?.personalColor ?? null;

  return (
    <Panel>
      <Stack>
        <Heading style={styles.panelHeading}>퍼스널 컬러</Heading>
        <BodyText>추천 색상, 주의 색상, 컬러 조합과 스타일링 근거를 확인합니다.</BodyText>
        {isLoadingProfile ? <BodyText>퍼스널 컬러 결과를 불러오는 중입니다...</BodyText> : null}
        {message ? <BodyText>{message}</BodyText> : null}
        {!personalColor ? (
          <Card style={{ borderStyle: "dashed" }}>
            <Stack>
              <BodyText style={styles.centerStrong}>저장된 퍼스널 컬러 진단이 없습니다.</BodyText>
              <BodyText style={styles.centerText}>
                선명한 정면 얼굴 사진으로 진단하면 색상별 추천근거, 비추천근거, 컬러조합과 의미가 저장됩니다.
              </BodyText>
            </Stack>
          </Card>
        ) : (
          <PersonalColorResultDetails result={personalColor} />
        )}
        <Button onPress={() => router.push("/personal-color?source=mypage")}>
          {personalColor ? "퍼스널 컬러 다시 진단" : "퍼스널 컬러 진단"}
        </Button>
      </Stack>
    </Panel>
  );
}

function AccountPanel({
  me,
  onSaved,
}: {
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
      setMessage("계정 설정이 저장되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "계정 설정 저장에 실패했습니다.");
    } finally {
      setPending(false);
    }
  };

  const handleSignOut = async () => {
    if (signOutPending) return;
    setSignOutPending(true);
    setMessage(null);

    try {
      await signOut();
      router.replace("/login");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "로그아웃에 실패했습니다.");
    } finally {
      setSignOutPending(false);
    }
  };

  return (
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
      </Stack>
    </Panel>
  );
}

export default function MyPageScreen() {
  const api = useHairfitApi();
  const router = useRouter();
  const searchParams = useLocalSearchParams();
  const requestedTab = normalizeTab(searchParams.tab);
  const setupParam = Array.isArray(searchParams.setup) ? searchParams.setup[0] : searchParams.setup;
  const setupRequested = setupParam === "1" || setupParam === "true";
  const { isLoaded, isSignedIn } = useAuth();
  const [dashboard, setDashboard] = useState<Extract<MobileDashboard, { service: "customer" } > | null>(null);
  const [me, setMe] = useState<MobileBootstrap | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isLoaded) return;
      if (!isSignedIn) {
        setDashboard(null);
        setError("로그인하면 사용기록, 플랜, 에프터케어, 바디프로필 설정을 확인할 수 있습니다.");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const [mobileMe, result] = await Promise.all([api.getMobileMe(), api.getMobileDashboard("customer")]);
        if (!cancelled && result.service === "customer") {
          setMe(mobileMe);
          setDashboard(result);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "대시보드를 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, isLoaded, isSignedIn]);

  const customer = dashboard?.customer;
  const credits = customer?.credits ?? me?.credits ?? 0;
  const activePlan = formatPlanLabel(customer?.planKey ?? me?.planKey);
  const estimatedStyles = Math.floor(credits / 5);
  const usedCredits = 0;
  const activeTab: MyPageTabId = setupRequested || (me !== null && !me.accountSetupComplete) ? "account" : requestedTab;

  const activePanel = useMemo(() => {
    if (activeTab === "plan") {
      return <PlanPanel activePlan={activePlan} payments={customer?.recentPayments ?? []} />;
    }
    if (activeTab === "aftercare") return <AftercarePanel />;
    if (activeTab === "personal-color") return <PersonalColorPanel />;
    if (activeTab === "body-profile") return <BodyProfilePanel />;
    if (activeTab === "account") return <AccountPanel me={me} onSaved={setMe} />;
    return <UsagePanel generations={customer?.recentGenerations ?? []} />;
  }, [activePlan, activeTab, customer?.recentGenerations, customer?.recentPayments, me]);

  return (
    <Screen
      footerOverlay={
        <Button onPress={() => router.push("/workspace")}>
          헤어스타일 생성
        </Button>
      }
    >
      <TabNavigation activeTab={activeTab} />

      {error && isSignedIn ? (
        <Card>
          <BodyText>{error}</BodyText>
        </Card>
      ) : null}

      {isLoading ? (
        <Card>
          <BodyText>불러오는 중...</BodyText>
        </Card>
      ) : null}

      <MetricGrid>
        <MetricTile label="크레딧" value={credits.toLocaleString("ko-KR")} helper={`헤어 생성 약 ${estimatedStyles.toLocaleString("ko-KR")}회 가능`} />
        <MetricTile label="플랜" value={activePlan} helper="활성 구독 정보 없음" />
        <MetricTile label="사용량" value={usedCredits.toLocaleString("ko-KR")} helper="최근 생성 기록에서 사용한 크레딧" />
        <MetricTile label="바디프로필" value={customer?.styleProfileReady ? "준비됨" : "필요"} helper="아래 프로필을 완성하세요" />
      </MetricGrid>

      <Divider />
      {activePanel}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerStrong: {
    color: "#f4f1e8",
    fontWeight: "900",
    textAlign: "center",
  },
  centerText: {
    textAlign: "center",
  },
  panelHeading: {
    fontSize: 22,
    lineHeight: 28,
  },
  tabPanel: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  tabScrollerContent: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 8,
  },
  strongText: {
    color: "#f4f1e8",
    fontWeight: "800",
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
