import { useAuth, useClerk } from "@clerk/clerk-expo";
import type { MobileBootstrap } from "@hairfit/shared";
import { Button, Chip, colors, spacing } from "@hairfit/ui-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useHairfitApi } from "../lib/api";

const quickActions = [
  { label: "사진 업로드", description: "3x3 추천 시작", route: "/upload" },
  { label: "패션 코디", description: "헤어 선택 후 룩북", route: "/styler/new" },
  { label: "에프터케어", description: "시술 기록 관리", route: "/aftercare" },
  { label: "마이페이지", description: "크레딧과 결과", route: "/mypage" },
] as const;

const proofItems = [
  ["1장", "정면 사진"],
  ["9개", "헤어 후보"],
  ["코디", "패션 추천"],
] as const;

export default function CustomerHomeScreen() {
  const router = useRouter();
  const api = useHairfitApi();
  const { signOut } = useClerk();
  const { isLoaded, isSignedIn } = useAuth();
  const [bootstrap, setBootstrap] = useState<MobileBootstrap | null>(null);
  const [message, setMessage] = useState("세션을 확인하는 중입니다.");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isLoaded) return;
      if (!isSignedIn) {
        setBootstrap(null);
        setMessage("로그인하면 웹과 같은 크레딧, 생성 기록, 마이페이지를 사용합니다.");
        return;
      }

      try {
        const next = await api.getMobileMe();
        if (!cancelled) {
          setBootstrap(next);
          setMessage(next.onboardingComplete ? "바로 스타일 생성을 시작할 수 있습니다." : "온보딩을 완료하면 추천을 시작할 수 있습니다.");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "세션 정보를 불러오지 못했습니다.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, isLoaded, isSignedIn]);

  const startFlow = () => {
    if (!isSignedIn) {
      router.push("/login");
      return;
    }
    if (bootstrap && !bootstrap.onboardingComplete) {
      router.push("/onboarding");
      return;
    }
    router.push("/upload");
  };

  const primaryLabel = !isSignedIn
    ? "로그인하고 시작하기"
    : bootstrap && !bootstrap.onboardingComplete
      ? "온보딩 완료하기"
      : "사진 업로드";

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <View style={styles.topRow}>
          <View>
            <Text style={styles.kicker}>HairFit</Text>
            <Text style={styles.brand}>Graphite Champagne</Text>
          </View>
          <Chip tone={isSignedIn ? "success" : "accent"}>{isSignedIn ? "Signed in" : "Guest"}</Chip>
        </View>

        <Text style={styles.heroTitle}>내 얼굴 사진 한 장으로{"\n"}9가지 헤어 미리보기</Text>
        <Text style={styles.heroBody}>헤어를 고르면 체형과 무드에 맞춘 패션 코디까지 이어집니다.</Text>

        <Pressable
          accessibilityRole="button"
          onPress={startFlow}
          style={({ pressed }) => [styles.heroCta, pressed ? styles.pressed : null]}
        >
          <Text style={styles.heroCtaText}>{primaryLabel}</Text>
        </Pressable>

        <View style={styles.proofGrid}>
          {proofItems.map(([value, label]) => (
            <View key={label} style={styles.proofCard}>
              <Text style={styles.proofValue}>{value}</Text>
              <Text style={styles.proofLabel}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.sessionCard}>
        <Text style={styles.sectionKicker}>Session</Text>
        <Text style={styles.sectionTitle}>{bootstrap?.displayName || bootstrap?.email || "게스트"}</Text>
        <Text style={styles.body}>{message}</Text>

        {bootstrap ? (
          <View style={styles.accountGrid}>
            <View style={styles.accountCard}>
              <Text style={styles.accountValue}>{bootstrap.credits.toLocaleString("ko-KR")}</Text>
              <Text style={styles.accountLabel}>크레딧</Text>
            </View>
            <View style={styles.accountCard}>
              <Text style={styles.accountValue}>{bootstrap.planKey || "free"}</Text>
              <Text style={styles.accountLabel}>플랜</Text>
            </View>
          </View>
        ) : null}

        {!isSignedIn ? (
          <View style={styles.buttonStack}>
            <Button onPress={() => router.push("/login")}>로그인</Button>
            <Button variant="secondary" onPress={() => router.push("/signup")}>회원가입</Button>
          </View>
        ) : (
          <View style={styles.buttonStack}>
            <Button variant="secondary" onPress={() => router.push("/mypage")}>마이페이지</Button>
            <Button variant="ghost" onPress={() => void signOut()}>로그아웃</Button>
          </View>
        )}
      </View>

      <View style={styles.actionsSection}>
        <Text style={styles.sectionKicker}>Next</Text>
        <Text style={styles.sectionTitle}>바로 이어가기</Text>
        <View style={styles.actionGrid}>
          {quickActions.map((action) => (
            <Pressable
              accessibilityRole="button"
              key={action.route}
              onPress={() => router.push(action.route)}
              style={({ pressed }) => [styles.actionCard, pressed ? styles.pressed : null]}
            >
              <Text style={styles.actionLabel}>{action.label}</Text>
              <Text style={styles.actionDescription}>{action.description}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.legalRow}>
        <Pressable onPress={() => router.push("/legal/privacy")}>
          <Text style={styles.legalText}>개인정보처리방침</Text>
        </Pressable>
        <Text style={styles.legalDivider}>/</Text>
        <Pressable onPress={() => router.push("/legal/terms")}>
          <Text style={styles.legalText}>이용약관</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    gap: spacing.md,
    minHeight: "100%",
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  hero: {
    backgroundColor: colors.inverse,
    borderRadius: 8,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  topRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  kicker: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  brand: {
    color: colors.inverseText,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 3,
  },
  heroTitle: {
    color: colors.inverseText,
    fontSize: 31,
    fontWeight: "900",
    lineHeight: 37,
  },
  heroBody: {
    color: "#d8d0c5",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 24,
  },
  heroCta: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 54,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  heroCtaText: {
    color: colors.inverseText,
    fontSize: 16,
    fontWeight: "900",
  },
  proofGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  proofCard: {
    backgroundColor: "#24201d",
    borderColor: "#3a332d",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    padding: spacing.sm,
  },
  proofValue: {
    color: colors.inverseText,
    fontSize: 21,
    fontWeight: "900",
  },
  proofLabel: {
    color: "#c9c0b5",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 4,
  },
  sessionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  sectionKicker: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 23,
    fontWeight: "900",
    lineHeight: 28,
  },
  body: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  accountGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  accountCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    flex: 1,
    padding: spacing.md,
  },
  accountValue: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900",
  },
  accountLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },
  buttonStack: {
    gap: spacing.sm,
  },
  actionsSection: {
    gap: spacing.sm,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  actionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: spacing.md,
    width: "48.5%",
  },
  pressed: {
    opacity: 0.78,
  },
  actionLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  actionDescription: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 6,
  },
  legalRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  legalText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  legalDivider: {
    color: colors.border,
    fontSize: 12,
    fontWeight: "800",
  },
});
