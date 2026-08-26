import { useAuth } from "@clerk/clerk-expo";
import {
  type MobileBootstrap,
  type MobileDashboard,
} from "@hairfit/shared";
import {
  BodyText,
  Button,
  Card,
  Heading,
  Kicker,
  Stack,
} from "@hairfit/ui-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Modal, StyleSheet, Text, View } from "react-native";
import { AppScreen } from "../components/app/AppScreen";
import {
  resolveMotionAwareModalAnimation,
  useReducedMotionPreference,
} from "../hooks/useReducedMotionPreference";
import { useHairfitApi } from "../lib/api";
import { useNetworkRecovery } from "../components/app/NetworkRecoveryProvider";
import {
  resolveMobileAuthRecovery,
  waitForMobileAuthRetry,
} from "../lib/mobile-auth-expiry";
import { mapMobileUserError } from "../lib/mobile-user-message";
import {
  CustomerBody,
  CustomerButton,
  CustomerCard,
  CustomerHeading,
  CustomerKicker,
  CustomerScreen,
  CustomerSectionHeader,
} from "../components/customer/CustomerPrimitives";
import { customerColors } from "../lib/customer-ui";
import { formatMobileMyPagePlanLabel } from "../lib/mypage";

type CustomerDashboard = Extract<MobileDashboard, { service: "customer" }>["customer"];

function displayName(me: MobileBootstrap | null) {
  const name = me?.displayName?.trim();
  if (name) return name;
  const emailName = me?.email?.split("@")[0]?.trim();
  return emailName || "HairFit 사용자";
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
  const inProgress = customer?.recentGenerations.find((item) =>
    ["queued", "pending", "processing", "running", "generating"].includes(item.status.toLowerCase()),
  ) ?? null;
  const completed = customer?.recentGenerations.find((item) => item.status.toLowerCase() === "completed") ?? null;
  const care = customer?.recentConfirmedStyles[0] ?? null;
  const heroImage =
    completed?.selectedVariantImageUrl ??
    customer?.recentStylingSessions.find((item) => item.imageUrl)?.imageUrl ??
    care?.selectedVariantImageUrl ??
    null;

  return (
    <CustomerScreen>
      <View style={styles.customerHeader}>
        <CustomerKicker>Private AI Atelier</CustomerKicker>
        <CustomerHeading>{displayName(me)}님, 오늘은 어떤 변화를 원하세요?</CustomerHeading>
        <CustomerBody>원하는 분위기와 관리 습관을 함께 살펴보고 내 얼굴에 맞는 스타일을 차분하게 찾아드릴게요.</CustomerBody>
        <View style={styles.customerMembershipPill}>
          <Text style={styles.customerMembershipText}>
            {formatMobileMyPagePlanLabel(customer?.planKey ?? me?.planKey)} 멤버십
          </Text>
        </View>
      </View>

      {message ? (
        <View accessibilityLiveRegion="polite">
          <CustomerCard><CustomerBody>{message}</CustomerBody></CustomerCard>
        </View>
      ) : null}

      {isLoading ? (
        <CustomerCard><CustomerBody>스타일 홈을 불러오는 중...</CustomerBody></CustomerCard>
      ) : null}

      <CustomerCard style={styles.customerHero}>
        <View style={styles.customerHeroVisual}>
          {heroImage ? (
            <Image
              accessibilityLabel="최근 완성한 스타일"
              accessibilityRole="image"
              source={{ uri: heroImage }}
              style={styles.customerHeroImage}
            />
          ) : (
            <View style={styles.customerHeroPlaceholder}>
              <Text style={styles.customerHeroMonogram}>HF</Text>
              <Text style={styles.customerHeroPlaceholderText}>YOUR NEXT SIGNATURE LOOK</Text>
            </View>
          )}
        </View>
        <View style={styles.customerHeroCopy}>
          <CustomerKicker>New consultation</CustomerKicker>
          <CustomerHeading compact>나답게 바뀌는 가장 편안한 방법</CustomerHeading>
          <CustomerBody>기존 상담 방식 그대로 사진과 답변을 이어가면 얼굴 균형과 현실적인 관리 조건을 함께 고려해 추천해 드립니다.</CustomerBody>
          <CustomerButton onPress={() => router.push("/consulting")}>새 컨설팅 시작</CustomerButton>
        </View>
      </CustomerCard>

      <CustomerSectionHeader kicker="Continue" title="지금 필요한 일부터" />
      <CustomerCard style={styles.customerPriorityCard}>
        <CustomerKicker>1 · 진행 중</CustomerKicker>
        <CustomerHeading compact>{inProgress ? "진행 중인 컨설팅이 있어요" : "진행 중인 컨설팅이 없어요"}</CustomerHeading>
        <CustomerBody>{inProgress ? "현재 작업 상태를 확인하고 결과가 준비되면 바로 이어보세요." : "새 컨설팅을 시작하면 진행 상태가 이곳에 표시됩니다."}</CustomerBody>
        <CustomerButton secondary onPress={() => router.push(inProgress ? `/generate/${inProgress.id}` : "/consulting")}>
          {inProgress ? "이어서 보기" : "컨설팅 시작"}
        </CustomerButton>
      </CustomerCard>

      <CustomerCard style={styles.customerPriorityCard}>
        <CustomerKicker>2 · 최근 결과</CustomerKicker>
        <CustomerHeading compact>{completed?.selectedVariantLabel || "최근 완성된 결과"}</CustomerHeading>
        <CustomerBody>{completed ? "완성된 추천 보드를 다시 비교해 보세요." : "완성된 결과가 이곳에 모입니다."}</CustomerBody>
        <CustomerButton secondary onPress={() => router.push(completed ? `/result/${completed.id}` : "/stylebook")}>
          {completed ? "결과 다시 보기" : "스타일북 보기"}
        </CustomerButton>
      </CustomerCard>

      <CustomerCard style={styles.customerPriorityCard}>
        <CustomerKicker>3 · 케어</CustomerKicker>
        <CustomerHeading compact>{care?.styleName || "내 스타일을 오래 유지해요"}</CustomerHeading>
        <CustomerBody>{care ? "확정한 시술의 맞춤 관리 가이드를 확인하세요." : "시술 확정 후 맞춤 관리 가이드가 준비됩니다."}</CustomerBody>
        <CustomerButton secondary onPress={() => router.push(care ? `/aftercare/${care.id}` : "/aftercare")}>케어 확인</CustomerButton>
      </CustomerCard>
    </CustomerScreen>
  );
}

export default function HairfitHomeScreen() {
  const api = useHairfitApi();
  const { recoveryToken } = useNetworkRecovery();
  const router = useRouter();
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;
  const [bootstrap, setBootstrap] = useState<MobileBootstrap | null>(null);
  const [dashboard, setDashboard] = useState<Extract<MobileDashboard, { service: "customer" }> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>("세션을 확인하는 중입니다.");
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [authRecoveryRequired, setAuthRecoveryRequired] = useState(false);
  const [authReloadKey, setAuthReloadKey] = useState(0);

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

      let authRetryCount = 0;

      while (!cancelled) {
        try {
          setIsLoading(true);
          setMessage(null);
          const next = await api.getMobileMe();
          if (cancelled) return;

          setBootstrap(next);
          setAuthRecoveryRequired(false);
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
          return;
        } catch (error) {
          if (!cancelled) {
            setDashboard(null);
            const authRecovery = resolveMobileAuthRecovery(error, authRetryCount);
            if (authRecovery === "retry") {
              authRetryCount += 1;
              setMessage("로그인 세션을 연결하는 중입니다. 잠시만 기다려 주세요.");
              await waitForMobileAuthRetry();
              continue;
            }
            if (authRecovery === "reconnect") {
              setAuthRecoveryRequired(true);
              setMessage("로그인 세션을 서버와 연결하지 못했습니다. 다시 시도하거나 로그인을 다시 연결해 주세요.");
              return;
            }
            setMessage(mapMobileUserError(error, "홈 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
          }
          return;
        } finally {
          if (!cancelled) {
            setIsLoading(false);
          }
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, authReloadKey, isLoaded, isSignedIn, recoveryToken]);

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

  if (isSignedIn && authRecoveryRequired) {
    return (
      <AppScreen>
        <Card>
          <Stack>
            <Heading>로그인 연결 확인</Heading>
            <BodyText>{message}</BodyText>
            <Button
              onPress={() => {
                setAuthRecoveryRequired(false);
                setAuthReloadKey((current) => current + 1);
              }}
            >
              다시 시도
            </Button>
            <Button
              variant="secondary"
              onPress={() => {
                void signOutRef.current()
                  .catch(() => undefined)
                  .finally(() => router.replace("/login"));
              }}
            >
              로그인 다시 연결
            </Button>
          </Stack>
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
  customerHeader: {
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  customerMembershipPill: {
    alignSelf: "flex-start",
    backgroundColor: customerColors.raised,
    borderColor: customerColors.line,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  customerMembershipText: {
    color: customerColors.ivory,
    fontSize: 12,
    fontWeight: "700",
  },
  customerHero: {
    padding: 0,
  },
  customerHeroVisual: {
    aspectRatio: 4 / 5,
    backgroundColor: customerColors.raised,
    width: "100%",
  },
  customerHeroImage: {
    height: "100%",
    resizeMode: "cover",
    width: "100%",
  },
  customerHeroPlaceholder: {
    alignItems: "center",
    backgroundColor: customerColors.raised,
    flex: 1,
    justifyContent: "center",
  },
  customerHeroMonogram: {
    color: customerColors.champagne,
    fontFamily: "serif",
    fontSize: 72,
    fontWeight: "600",
    letterSpacing: -6,
  },
  customerHeroPlaceholderText: {
    color: customerColors.muted,
    fontSize: 9,
    letterSpacing: 2,
    marginTop: 8,
  },
  customerHeroCopy: {
    gap: 12,
    padding: 20,
  },
  customerPriorityCard: {
    gap: 12,
  },
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
