import { useAuth } from "@clerk/clerk-expo";
import {
  deriveGenerationDisplayStatus,
  getStylingSessionStatusPresentation,
  type MobileBootstrap,
  type MobileConfirmedStyle,
  type MobileDashboard,
  type MobileDashboardStylingSession,
} from "@hairfit/shared";
import {
  BodyText,
  Button,
  Card,
  Chip,
  Cluster,
  Heading,
  Kicker,
  MetricGrid,
  MetricTile,
  Panel,
  Stack,
} from "@hairfit/ui-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, Modal, StyleSheet, Text, View } from "react-native";
import { AppScreen } from "../components/app/AppScreen";
import {
  resolveMotionAwareModalAnimation,
  useReducedMotionPreference,
} from "../hooks/useReducedMotionPreference";
import { useHairfitApi } from "../lib/api";
import { useNetworkRecovery } from "../components/app/NetworkRecoveryProvider";
import { mapMobileUserError } from "../lib/mobile-user-message";

type CustomerDashboard = Extract<MobileDashboard, { service: "customer" }>["customer"];

function displayName(me: MobileBootstrap | null) {
  const name = me?.displayName?.trim();
  if (name) return name;
  const emailName = me?.email?.split("@")[0]?.trim();
  return emailName || "HairFit 사용자";
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

function genreLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    minimal: "미니멀",
    street: "스트릿",
    casual: "캐주얼",
    classic: "클래식",
    office: "오피스",
    date: "데이트",
    formal: "포멀",
    athleisure: "애슬레저",
  };
  return value ? labels[value] ?? value : "스타일";
}

const serviceLabels: Record<string, string> = {
  cut: "커트",
  perm: "펌",
  color: "염색",
  bleach: "탈색",
  treatment: "트리트먼트",
  other: "기타 시술",
};

function findSelectedHair(customer: CustomerDashboard | null) {
  if (!customer) return null;
  return (
    customer.recentGenerations.find(
      (item) => item.selectedVariantId && deriveGenerationDisplayStatus({
        status: item.status,
        completedVariantCount: item.completedVariantCount,
        totalVariantCount: item.totalVariantCount,
      }) === "completed",
    ) ??
    customer.recentGenerations.find((item) => item.selectedVariantId) ??
    null
  );
}

function buildCta(customer: CustomerDashboard | null) {
  const completedStyling = customer?.recentStylingSessions.find((item) => item.status === "completed") ?? null;
  if (completedStyling) {
    return {
      kicker: "최근 스타일 추천",
      title: "최근 스타일 추천 보기",
      description: completedStyling.headline || "완성된 룩북과 추천 코디를 다시 확인하세요.",
      route: `/styler/${completedStyling.id}`,
      button: "열기",
    };
  }

  const selectedHair = findSelectedHair(customer);
  if (selectedHair?.selectedVariantId) {
    return {
      kicker: "다음 단계",
      title: "이 헤어로 패션 추천 시작",
      description: selectedHair.selectedVariantLabel || "선택한 헤어에 맞춘 코디 방향을 이어서 만드세요.",
      route: `/styler/new?generationId=${encodeURIComponent(selectedHair.id)}&variant=${encodeURIComponent(selectedHair.selectedVariantId)}`,
      button: "패션 추천 시작",
    };
  }

  return {
    kicker: "새 작업",
    title: "새 헤어 만들기",
    description: "정면 사진 한 장으로 3x3 헤어 추천 보드를 시작하세요.",
    route: "/upload",
    button: "사진 선택",
  };
}

function PreviewBox({
  accessibilityLabel,
  aspectRatio = 4 / 5,
  source,
}: {
  accessibilityLabel: string;
  aspectRatio?: number;
  source: string | null;
}) {
  return (
    <View style={[styles.preview, { aspectRatio }]}>
      {source ? (
        <Image
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="image"
          source={{ uri: source }}
          style={styles.previewImage}
        />
      ) : <BodyText>이미지 준비 중</BodyText>}
    </View>
  );
}

function ConfirmedStyleCard({ item }: { item: MobileConfirmedStyle }) {
  const router = useRouter();

  return (
    <Card>
      <Stack gap={10}>
        <PreviewBox
          accessibilityLabel={`${item.styleName} 시술 확정 스타일`}
          source={item.selectedVariantImageUrl}
        />
        <Cluster>
          <Chip tone="success">시술 확정</Chip>
          <Chip>{serviceLabels[item.serviceType] || item.serviceType}</Chip>
        </Cluster>
        <Heading style={styles.cardHeading}>{item.styleName}</Heading>
        <BodyText>시술일 {formatDate(item.serviceDate)}</BodyText>
        <Button variant="secondary" onPress={() => router.push(`/aftercare/${item.id}`)}>
          관리 가이드 보기
        </Button>
      </Stack>
    </Card>
  );
}

function StyleHistoryCard({ item }: { item: MobileDashboardStylingSession }) {
  const router = useRouter();
  const presentation = getStylingSessionStatusPresentation(item.status);

  return (
    <Card>
      <Stack gap={10}>
        <PreviewBox
          accessibilityLabel={`${item.headline || genreLabel(item.genre)} 패션 추천 결과`}
          aspectRatio={3 / 4}
          source={item.imageUrl}
        />
        <Cluster>
          <Chip tone={presentation.tone}>{presentation.labelKo}</Chip>
          <Chip>{genreLabel(item.genre)}</Chip>
        </Cluster>
        <Heading style={styles.cardHeading}>{item.headline || "패션 추천"}</Heading>
        <BodyText>{item.summary || `${formatDate(item.createdAt)} 생성`}</BodyText>
        <Button variant="secondary" onPress={() => router.push(`/styler/${item.id}`)}>
          열기
        </Button>
      </Stack>
    </Card>
  );
}

function EmptyHistoryCard({
  button,
  route,
  title,
}: {
  button: string;
  route: string;
  title: string;
}) {
  const router = useRouter();

  return (
    <Card style={styles.emptyCard}>
      <Stack gap={10}>
        <BodyText style={styles.emptyTitle}>{title}</BodyText>
        <Button onPress={() => router.push(route)}>{button}</Button>
      </Stack>
    </Card>
  );
}

function LoginPromptScreen() {
  const router = useRouter();

  return (
    <AppScreen>
      <View style={styles.loginHero}>
        <Stack gap={18} style={styles.loginHeroContent}>
          <View style={styles.loginLogoMark}>
            <Text style={styles.loginLogoText}>HairFit</Text>
          </View>
          <Stack gap={10}>
            <Kicker>AI 헤어 미리보기</Kicker>
            <Heading style={styles.loginHeroTitle}>내 얼굴에 어울리는 헤어스타일을 먼저 확인하세요</Heading>
            <BodyText style={styles.loginHeroText}>
              사진 한 장으로 헤어 후보를 비교하고, 선택한 스타일에 맞춘 코디와 관리 기록까지 이어갑니다.
            </BodyText>
          </Stack>
          <Button variant="secondary" onPress={() => router.push("/login")}>
            로그인
          </Button>
        </Stack>
      </View>
    </AppScreen>
  );
}

function AccountSetupModal({
  open,
  onClose,
  onOpenSettings,
}: {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  const reduceMotion = useReducedMotionPreference();

  return (
    <Modal
      animationType={resolveMotionAwareModalAnimation(reduceMotion, "fade")}
      transparent
      visible={open}
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={styles.modalPanel}>
          <Stack gap={12}>
            <Kicker>계정 설정</Kicker>
            <Heading style={styles.modalHeading}>계정 설정을 먼저 완료해 주세요</Heading>
            <BodyText>
              닉네임, 성별, 선호 톤을 저장하면 헤어 생성과 스타일 추천을 바로 사용할 수 있습니다.
            </BodyText>
            <Button onPress={onOpenSettings}>계정 설정으로 이동</Button>
            <Button variant="secondary" onPress={onClose}>
              나중에 하기
            </Button>
          </Stack>
        </View>
      </View>
    </Modal>
  );
}

function CustomerHome({
  customer,
  isLoading,
  me,
  message,
}: {
  customer: CustomerDashboard | null;
  isLoading: boolean;
  me: MobileBootstrap | null;
  message: string | null;
}) {
  const router = useRouter();
  const secondaryCta = buildCta(customer);
  const showSecondaryCta = secondaryCta.route !== "/upload";
  const selectedHair = findSelectedHair(customer);
  const confirmedStyleItems = (customer?.recentConfirmedStyles ?? []).slice(0, 3);
  const stylingItems = (customer?.recentStylingSessions ?? []).slice(0, 3);
  const styleEmptyRoute = selectedHair?.selectedVariantId
    ? `/styler/new?generationId=${encodeURIComponent(selectedHair.id)}&variant=${encodeURIComponent(selectedHair.selectedVariantId)}`
    : "/upload";

  return (
    <AppScreen>
      <Panel>
        <Stack>
          <Kicker>앱 홈</Kicker>
          <Heading>{displayName(me)}님의 스타일 홈</Heading>
          <BodyText>시술 확정 스타일과 패션 추천 기록을 이어서 확인하고 다음 스타일 작업을 바로 시작하세요.</BodyText>
          <Button variant="secondary" onPress={() => router.push("/mypage")}>
            마이페이지
          </Button>
        </Stack>
      </Panel>

      {message ? (
        <View accessibilityLiveRegion="polite">
          <Card>
            <BodyText>{message}</BodyText>
          </Card>
        </View>
      ) : null}

      {isLoading ? (
        <Card>
          <BodyText>불러오는 중...</BodyText>
        </Card>
      ) : null}

      <MetricGrid>
        <MetricTile label="크레딧" value={(customer?.credits ?? me?.credits ?? 0).toLocaleString("ko-KR")} helper="헤어와 룩북 생성에 사용" />
        <MetricTile label="플랜" value={customer?.planKey ?? me?.planKey ?? "free"} helper="현재 활성 플랜" />
        <MetricTile
          label="바디 프로필"
          value={customer?.styleProfileReady ? "준비됨" : "필요"}
          helper={customer?.styleProfileReady ? "패션 추천 가능" : "패션 추천 전 입력 필요"}
        />
      </MetricGrid>

      <Panel style={styles.ctaPanel}>
        <Stack>
          <Kicker>헤어스타일 생성</Kicker>
          <Heading>사진 업로드로 새 헤어 만들기</Heading>
          <BodyText style={styles.ctaText}>정면 사진 한 장으로 3x3 헤어 추천 보드를 바로 시작하세요.</BodyText>
          <Button onPress={() => router.push("/upload")}>사진 업로드</Button>
          <Button variant="secondary" onPress={() => router.push("/personal-color?source=upload")}>
            퍼스널컬러 진단
          </Button>
          {showSecondaryCta ? (
            <Button variant="secondary" onPress={() => router.push(secondaryCta.route)}>
              {secondaryCta.title}
            </Button>
          ) : null}
        </Stack>
      </Panel>

      <Panel>
        <Stack>
          <Kicker>확정 스타일</Kicker>
          <Heading style={styles.sectionHeading}>시술 확정 목록</Heading>
          {confirmedStyleItems.length === 0 ? (
            <EmptyHistoryCard button="스타일 찾기" route="/upload" title="아직 시술 확정한 스타일이 없습니다." />
          ) : (
            confirmedStyleItems.map((item) => <ConfirmedStyleCard item={item} key={item.id} />)
          )}
          <Button variant="secondary" onPress={() => router.push("/aftercare")}>시술 확정 전체 보기</Button>
        </Stack>
      </Panel>

      <Panel>
        <Stack>
          <Kicker>스타일 기록</Kicker>
          <Heading style={styles.sectionHeading}>스타일 추천 기록</Heading>
          {stylingItems.length === 0 ? (
            <EmptyHistoryCard
              button={selectedHair ? "패션 추천 시작" : "헤어 생성 먼저 시작"}
              route={styleEmptyRoute}
              title="아직 스타일 추천 기록이 없습니다."
            />
          ) : (
            stylingItems.map((item) => <StyleHistoryCard item={item} key={item.id} />)
          )}
        </Stack>
      </Panel>
    </AppScreen>
  );
}

export default function HairfitHomeScreen() {
  const api = useHairfitApi();
  const { recoveryToken } = useNetworkRecovery();
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [bootstrap, setBootstrap] = useState<MobileBootstrap | null>(null);
  const [dashboard, setDashboard] = useState<Extract<MobileDashboard, { service: "customer" }> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>("세션을 확인하는 중입니다.");
  const [setupModalOpen, setSetupModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isLoaded) return;

      if (!isSignedIn) {
        setBootstrap(null);
        setDashboard(null);
        setIsLoading(false);
        setMessage("로그인하면 시술 확정 스타일과 스타일 추천 기록을 확인할 수 있습니다.");
        return;
      }

      try {
        setIsLoading(true);
        setMessage(null);
        const next = await api.getMobileMe();
        if (cancelled) return;

        setBootstrap(next);
        if (next.accountType !== "member") {
          setDashboard(null);
          if (!next.accountType || !next.accountSetupComplete) {
            setMessage("계정 설정을 마치면 HairFit 앱을 더 정확하게 사용할 수 있습니다.");
          }
          return;
        }

        if (!next.accountSetupComplete) {
          setMessage("계정 설정을 마치면 HairFit 앱을 더 정확하게 사용할 수 있습니다.");
        }

        const customerDashboard = await api.getMobileDashboard("customer");
        if (!cancelled && customerDashboard.service === "customer") {
          setDashboard(customerDashboard);
        }
      } catch (error) {
        if (!cancelled) {
          setDashboard(null);
          setMessage(mapMobileUserError(error, "홈 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
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
  }, [api, isLoaded, isSignedIn, recoveryToken]);

  const shouldPromptAccountSetup = Boolean(
    bootstrap && !bootstrap.accountSetupComplete && (!bootstrap.accountType || bootstrap.accountType === "member"),
  );

  useFocusEffect(
    useCallback(() => {
      if (shouldPromptAccountSetup) {
        setSetupModalOpen(true);
      }
    }, [shouldPromptAccountSetup]),
  );

  useEffect(() => {
    if (!shouldPromptAccountSetup) {
      setSetupModalOpen(false);
    }
  }, [shouldPromptAccountSetup]);

  useEffect(() => {
    if (!bootstrap) return;

    if (bootstrap.accountType === "admin") {
      router.replace("/admin/stats");
    }

    if (bootstrap.accountType === "salon_owner") {
      router.replace("/salon/customers");
    }
  }, [bootstrap, router]);

  if (isLoaded && !isSignedIn) {
    return <LoginPromptScreen />;
  }

  if (isSignedIn && isLoading && !bootstrap) {
    return (
      <AppScreen>
        <Card>
          <BodyText>홈 정보를 불러오는 중...</BodyText>
        </Card>
      </AppScreen>
    );
  }

  if (bootstrap && (!bootstrap.accountType || bootstrap.accountType === "member")) {
    return (
      <>
        <CustomerHome customer={dashboard?.customer ?? null} isLoading={isLoading} me={bootstrap} message={message} />
        <AccountSetupModal
          open={shouldPromptAccountSetup && setupModalOpen}
          onClose={() => setSetupModalOpen(false)}
          onOpenSettings={() => {
            setSetupModalOpen(false);
            router.push("/mypage?tab=account&setup=1");
          }}
        />
      </>
    );
  }

  return (
    <AppScreen>
      <Card>
        <BodyText>{message || "계정 화면으로 이동하는 중입니다."}</BodyText>
      </Card>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  ctaPanel: {
    backgroundColor: "#101010",
    borderColor: "#d0b06a",
  },
  ctaText: {
    color: "#d8d0c2",
  },
  loginHero: {
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 620,
    paddingHorizontal: 12,
    paddingVertical: 32,
  },
  loginHeroContent: {
    width: "100%",
  },
  loginHeroText: {
    fontSize: 16,
    lineHeight: 24,
  },
  loginHeroTitle: {
    fontSize: 34,
    lineHeight: 40,
  },
  loginLogoMark: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: "#34322c",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  loginLogoText: {
    color: "#f4f1e8",
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 34,
  },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.68)",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  modalHeading: {
    fontSize: 24,
    lineHeight: 30,
  },
  modalPanel: {
    backgroundColor: "#181713",
    borderColor: "#d0b06a",
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 420,
    padding: 20,
    width: "100%",
  },
  sectionHeading: {
    fontSize: 24,
    lineHeight: 30,
  },
  cardHeading: {
    fontSize: 20,
    lineHeight: 26,
  },
  preview: {
    alignItems: "center",
    backgroundColor: "#eee8de",
    borderRadius: 8,
    justifyContent: "center",
    overflow: "hidden",
    width: "100%",
  },
  previewImage: {
    height: "100%",
    width: "100%",
  },
  emptyCard: {
    borderStyle: "dashed",
    paddingVertical: 28,
  },
  emptyTitle: {
    color: "#f4f1e8",
    fontWeight: "900",
    textAlign: "center",
  },
});
