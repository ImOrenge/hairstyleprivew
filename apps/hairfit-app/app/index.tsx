import { useAuth, useClerk } from "@clerk/clerk-expo";
import type {
  MobileBootstrap,
  MobileDashboard,
  MobileDashboardGeneration,
  MobileDashboardStylingSession,
  MobileServiceKey,
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
  Screen,
  Stack,
} from "@hairfit/ui-native";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useHairfitApi } from "../lib/api";

type CustomerDashboard = Extract<MobileDashboard, { service: "customer" }>["customer"];

const serviceLabels: Record<MobileServiceKey, { title: string; description: string }> = {
  customer: {
    title: "HairFit 고객 홈",
    description: "사진 업로드, 헤어 추천, 패션 스타일러, 결제와 마이페이지를 이용합니다.",
  },
  salon: {
    title: "Salon CRM",
    description: "고객 목록, 매칭, 방문 기록과 애프터케어 업무를 확인합니다.",
  },
  admin: {
    title: "운영 관리",
    description: "통계, 회원, 리뷰, B2B 리드와 운영 데이터를 확인합니다.",
  },
};

function servicesForBootstrap(bootstrap: MobileBootstrap | null) {
  return bootstrap?.services.length ? bootstrap.services : (["customer"] as MobileServiceKey[]);
}

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

function statusLabel(value: string | null | undefined) {
  const status = value?.toLowerCase();
  if (status === "completed") return "완료";
  if (status === "failed" || status === "error") return "실패";
  if (status === "processing" || status === "running" || status === "generating") return "생성 중";
  if (status === "queued" || status === "pending" || status === "recommended") return "준비됨";
  return value || "확인 중";
}

function statusTone(value: string | null | undefined): "neutral" | "accent" | "success" | "danger" {
  const status = value?.toLowerCase();
  if (status === "completed") return "success";
  if (status === "failed" || status === "error") return "danger";
  if (status === "processing" || status === "running" || status === "generating") return "accent";
  return "neutral";
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

function generationRoute(item: MobileDashboardGeneration) {
  if (item.selectedVariantId) {
    return `/result/${item.id}?variant=${encodeURIComponent(item.selectedVariantId)}`;
  }
  return `/generate/${item.id}`;
}

function findSelectedHair(customer: CustomerDashboard | null) {
  if (!customer) return null;
  return (
    customer.recentGenerations.find(
      (item) => item.selectedVariantId && item.status.toLowerCase() === "completed",
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
  aspectRatio = 4 / 5,
  source,
}: {
  aspectRatio?: number;
  source: string | null;
}) {
  return (
    <View style={[styles.preview, { aspectRatio }]}>
      {source ? <Image source={{ uri: source }} style={styles.previewImage} /> : <BodyText>이미지 준비 중</BodyText>}
    </View>
  );
}

function HairHistoryCard({ item }: { item: MobileDashboardGeneration }) {
  const router = useRouter();

  return (
    <Card>
      <Stack gap={10}>
        <PreviewBox source={item.selectedVariantImageUrl} />
        <Cluster>
          <Chip tone={statusTone(item.status)}>{statusLabel(item.status)}</Chip>
          <Chip>{formatDate(item.createdAt)}</Chip>
        </Cluster>
        <Heading style={styles.cardHeading}>{item.selectedVariantLabel || "3x3 헤어 추천 보드"}</Heading>
        <BodyText>
          완료 후보 {item.completedVariantCount}/{item.totalVariantCount || 9}
        </BodyText>
        <Button variant="secondary" onPress={() => router.push(generationRoute(item))}>
          열기
        </Button>
      </Stack>
    </Card>
  );
}

function StyleHistoryCard({ item }: { item: MobileDashboardStylingSession }) {
  const router = useRouter();

  return (
    <Card>
      <Stack gap={10}>
        <PreviewBox aspectRatio={3 / 4} source={item.imageUrl} />
        <Cluster>
          <Chip tone={statusTone(item.status)}>{statusLabel(item.status)}</Chip>
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
  const cta = buildCta(customer);
  const selectedHair = findSelectedHair(customer);
  const hairItems = (customer?.recentGenerations ?? []).slice(0, 3);
  const stylingItems = (customer?.recentStylingSessions ?? []).slice(0, 3);
  const styleEmptyRoute = selectedHair?.selectedVariantId
    ? `/styler/new?generationId=${encodeURIComponent(selectedHair.id)}&variant=${encodeURIComponent(selectedHair.selectedVariantId)}`
    : "/upload";

  return (
    <Screen>
      <Panel>
        <Stack>
          <Kicker>App Home</Kicker>
          <Heading>{displayName(me)}님의 스타일 홈</Heading>
          <BodyText>헤어 생성 기록과 패션 추천 기록을 이어서 확인하고 다음 스타일 작업을 바로 시작하세요.</BodyText>
        </Stack>
      </Panel>

      {message ? (
        <Card>
          <BodyText>{message}</BodyText>
        </Card>
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
          <Kicker>{cta.kicker}</Kicker>
          <Heading>{cta.title}</Heading>
          <BodyText style={styles.ctaText}>{cta.description}</BodyText>
          <Button onPress={() => router.push(cta.route)}>{cta.button}</Button>
        </Stack>
      </Panel>

      <Panel>
        <Stack>
          <Kicker>Hair History</Kicker>
          <Heading style={styles.sectionHeading}>헤어 생성 기록</Heading>
          {hairItems.length === 0 ? (
            <EmptyHistoryCard button="새 헤어 만들기" route="/upload" title="아직 헤어 생성 기록이 없습니다." />
          ) : (
            hairItems.map((item) => <HairHistoryCard item={item} key={item.id} />)
          )}
        </Stack>
      </Panel>

      <Panel>
        <Stack>
          <Kicker>Style History</Kicker>
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
    </Screen>
  );
}

function ServiceHub({
  bootstrap,
  isSignedIn,
  onOpenCustomerApp,
}: {
  bootstrap: MobileBootstrap | null;
  isSignedIn: boolean;
  onOpenCustomerApp?: () => void;
}) {
  const router = useRouter();
  const { signOut } = useClerk();
  const services = useMemo(() => servicesForBootstrap(bootstrap), [bootstrap]);
  const accountType = bootstrap?.accountType ?? "guest";

  function openService(service: MobileServiceKey) {
    if (!isSignedIn) {
      router.push("/login");
      return;
    }
    if (service === "customer") {
      onOpenCustomerApp?.();
      return;
    }
    if (service === "salon") {
      router.push("/salon/customers");
      return;
    }
    router.push("/admin");
  }

  return (
    <Screen>
      <Panel>
        <Stack>
          <Cluster>
            <Chip tone={isSignedIn ? "success" : "accent"}>{isSignedIn ? "Signed in" : "Guest"}</Chip>
            <Chip>{accountType}</Chip>
          </Cluster>
          <Kicker>HairFit App</Kicker>
          <Heading>서비스를 선택하세요</Heading>
          <BodyText>계정 권한에 맞는 HairFit 서비스를 이용할 수 있습니다.</BodyText>
          {!isSignedIn ? (
            <Cluster>
              <Button onPress={() => router.push("/login")}>로그인</Button>
              <Button variant="secondary" onPress={() => router.push("/signup")}>
                회원가입
              </Button>
            </Cluster>
          ) : (
            <Cluster>
              <Button variant="ghost" onPress={() => void signOut()}>
                로그아웃
              </Button>
            </Cluster>
          )}
        </Stack>
      </Panel>

      <Panel>
        <Stack>
          <Kicker>Services</Kicker>
          <Heading style={styles.sectionHeading}>권한별 진입</Heading>
          {services.map((service) => {
            const label = serviceLabels[service];
            return (
              <Card key={service}>
                <Stack gap={10}>
                  <Cluster>
                    <Chip tone={service === "customer" ? "accent" : service === "salon" ? "success" : "neutral"}>
                      {service}
                    </Chip>
                  </Cluster>
                  <Heading style={styles.cardHeading}>{label.title}</Heading>
                  <BodyText>{label.description}</BodyText>
                  <Button variant="secondary" onPress={() => openService(service)}>
                    열기
                  </Button>
                </Stack>
              </Card>
            );
          })}
        </Stack>
      </Panel>
    </Screen>
  );
}

export default function HairfitHomeScreen() {
  const api = useHairfitApi();
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [bootstrap, setBootstrap] = useState<MobileBootstrap | null>(null);
  const [dashboard, setDashboard] = useState<Extract<MobileDashboard, { service: "customer" }> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>("세션을 확인하는 중입니다.");
  const [showCustomerHome, setShowCustomerHome] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isLoaded) return;

      if (!isSignedIn) {
        setBootstrap(null);
        setDashboard(null);
        setIsLoading(false);
        setMessage("로그인하면 헤어 생성 기록과 스타일 추천 기록을 확인할 수 있습니다.");
        return;
      }

      try {
        setIsLoading(true);
        setMessage(null);
        const next = await api.getMobileMe();
        if (cancelled) return;

        setBootstrap(next);
        if (!next.onboardingComplete || !next.accountType) {
          setDashboard(null);
          setMessage("계정 설정을 마치면 HairFit 홈을 사용할 수 있습니다.");
          return;
        }

        if (next.accountType !== "member" && next.accountType !== "admin") {
          setDashboard(null);
          return;
        }

        const customerDashboard = await api.getMobileDashboard("customer");
        if (!cancelled && customerDashboard.service === "customer") {
          setDashboard(customerDashboard);
        }
      } catch (error) {
        if (!cancelled) {
          setDashboard(null);
          setMessage(error instanceof Error ? error.message : "홈 정보를 불러오지 못했습니다.");
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

  if (isLoaded && !isSignedIn) {
    return <ServiceHub bootstrap={bootstrap} isSignedIn={false} />;
  }

  if (isSignedIn && isLoading && !bootstrap) {
    return (
      <Screen>
        <Card>
          <BodyText>홈 정보를 불러오는 중...</BodyText>
        </Card>
      </Screen>
    );
  }

  if (bootstrap && (!bootstrap.onboardingComplete || !bootstrap.accountType)) {
    return (
      <Screen>
        <Panel>
          <Stack>
            <Kicker>Account Setup</Kicker>
            <Heading>계정 설정이 필요합니다</Heading>
            <BodyText>{message}</BodyText>
            <Button onPress={() => router.push("/onboarding")}>계정 설정하기</Button>
          </Stack>
        </Panel>
      </Screen>
    );
  }

  if (bootstrap?.accountType === "member" || (bootstrap?.accountType === "admin" && showCustomerHome)) {
    return <CustomerHome customer={dashboard?.customer ?? null} isLoading={isLoading} me={bootstrap} message={message} />;
  }

  return (
    <ServiceHub
      bootstrap={bootstrap}
      isSignedIn={Boolean(isSignedIn)}
      onOpenCustomerApp={() => setShowCustomerHome(true)}
    />
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
