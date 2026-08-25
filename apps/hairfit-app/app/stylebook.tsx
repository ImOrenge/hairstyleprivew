import { useAuth } from "@clerk/clerk-expo";
import type { MobileDashboard } from "@hairfit/shared";
import { type Href, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import {
  CustomerBody,
  CustomerButton,
  CustomerCard,
  CustomerHeading,
  CustomerKicker,
  CustomerScreen,
} from "../components/customer/CustomerPrimitives";
import { customerColors } from "../lib/customer-ui";
import { useHairfitApi } from "../lib/api";
import { mapMobileUserError } from "../lib/mobile-user-message";

type CustomerDashboard = Extract<MobileDashboard, { service: "customer" }>["customer"];

interface StylebookEntry {
  id: string;
  kind: string;
  title: string;
  description: string;
  imageUrl: string | null;
  href: string;
  createdAt: string;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export default function StylebookScreen() {
  const api = useHairfitApi();
  const router = useRouter();
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [dashboard, setDashboard] = useState<CustomerDashboard | null>(null);
  const [message, setMessage] = useState("스타일북을 불러오는 중입니다.");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isLoaded) return;
      if (!isSignedIn) {
        setLoading(false);
        setMessage("로그인하면 컨설팅 결과와 선택한 스타일을 한곳에서 확인할 수 있어요.");
        return;
      }

      setLoading(true);
      try {
        const result = await api.getMobileDashboard("customer");
        if (!cancelled && result.service === "customer") {
          setDashboard(result.customer);
          setMessage("");
        }
      } catch (error) {
        if (!cancelled) setMessage(mapMobileUserError(error, "스타일북을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, isLoaded, isSignedIn, userId]);

  const entries: StylebookEntry[] = dashboard ? [
    ...dashboard.recentGenerations.map((item) => ({
      id: `generation-${item.id}`,
      kind: "컨설팅 결과",
      title: item.selectedVariantLabel || item.promptUsed || "헤어 컨설팅",
      description: item.status.toLowerCase() === "completed" ? "완성된 추천 보드" : "진행 상태 확인",
      imageUrl: item.selectedVariantImageUrl,
      href: item.status.toLowerCase() === "completed" ? `/result/${item.id}` : `/generate/${item.id}`,
      createdAt: item.createdAt,
    })),
    ...dashboard.recentStylingSessions.map((item) => ({
      id: `styling-${item.id}`,
      kind: "스타일 추천",
      title: item.headline || "나만의 스타일 추천",
      description: item.summary || [item.genre, item.occasion, item.mood].filter(Boolean).join(" · ") || "통합 스타일 방향",
      imageUrl: item.imageUrl,
      href: `/styler/${item.id}`,
      createdAt: item.createdAt,
    })),
    ...dashboard.recentConfirmedStyles.map((item) => ({
      id: `care-${item.id}`,
      kind: "시술 확정",
      title: item.styleName,
      description: "케어 가이드 연결됨",
      imageUrl: item.selectedVariantImageUrl,
      href: `/aftercare/${item.id}`,
      createdAt: item.confirmedAt,
    })),
  ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()) : [];

  return (
    <CustomerScreen>
      <View style={styles.header}>
        <CustomerKicker>Stylebook</CustomerKicker>
        <CustomerHeading>발견한 나의 스타일을 한곳에</CustomerHeading>
        <CustomerBody>컨설팅 결과, 선택한 룩, 시술 확정 기록을 시간순으로 다시 비교할 수 있어요.</CustomerBody>
        <CustomerButton onPress={() => router.push("/consulting")}>새 컨설팅</CustomerButton>
      </View>

      {message ? (
        <CustomerCard style={styles.messageCard}>
          <CustomerBody>{message}</CustomerBody>
          {!isSignedIn && isLoaded ? <CustomerButton secondary onPress={() => router.push("/login")}>로그인</CustomerButton> : null}
        </CustomerCard>
      ) : null}

      {!loading && isSignedIn && entries.length === 0 ? (
        <CustomerCard style={styles.emptyCard}>
          <CustomerKicker>Your collection</CustomerKicker>
          <CustomerHeading compact>첫 스타일을 만들어 볼까요?</CustomerHeading>
          <CustomerBody>컨설팅을 완료하면 추천 결과와 선택한 스타일이 자동으로 이곳에 모입니다.</CustomerBody>
          <CustomerButton onPress={() => router.push("/consulting")}>컨설팅 시작</CustomerButton>
        </CustomerCard>
      ) : null}

      {entries.map((entry) => (
        <CustomerCard key={entry.id} style={styles.entryCard}>
          <View style={styles.preview}>
            {entry.imageUrl ? (
              <Image
                accessibilityLabel={entry.title}
                accessibilityRole="image"
                source={{ uri: entry.imageUrl }}
                style={styles.previewImage}
              />
            ) : (
              <View style={styles.placeholder}><Text style={styles.placeholderText}>HF</Text></View>
            )}
          </View>
          <View style={styles.entryBody}>
            <View style={styles.entryMeta}>
              <CustomerKicker>{entry.kind}</CustomerKicker>
              <Text style={styles.date}>{formatDate(entry.createdAt)}</Text>
            </View>
            <CustomerHeading compact>{entry.title}</CustomerHeading>
            <CustomerBody>{entry.description}</CustomerBody>
            <CustomerButton secondary onPress={() => router.push(entry.href as Href)}>열기</CustomerButton>
          </View>
        </CustomerCard>
      ))}
    </CustomerScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  messageCard: {
    gap: 12,
  },
  emptyCard: {
    gap: 12,
    minHeight: 320,
    justifyContent: "center",
  },
  entryCard: {
    padding: 0,
  },
  preview: {
    aspectRatio: 4 / 5,
    backgroundColor: customerColors.raised,
  },
  previewImage: {
    height: "100%",
    resizeMode: "cover",
    width: "100%",
  },
  placeholder: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  placeholderText: {
    color: customerColors.champagne,
    fontFamily: "serif",
    fontSize: 56,
    letterSpacing: -4,
  },
  entryBody: {
    gap: 10,
    padding: 18,
  },
  entryMeta: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  date: {
    color: customerColors.muted,
    fontSize: 11,
  },
});
