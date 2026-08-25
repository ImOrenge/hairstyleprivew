import type { MobileAftercareRecord } from "@hairfit/shared";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { useHairfitApi } from "../lib/api";
import { mapMobileUserError } from "../lib/mobile-user-message";
import {
  CustomerBody,
  CustomerButton,
  CustomerCard,
  CustomerHeading,
  CustomerKicker,
  CustomerScreen,
} from "../components/customer/CustomerPrimitives";
import { customerColors } from "../lib/customer-ui";

const serviceLabels: Record<string, string> = {
  cut: "커트",
  perm: "펌",
  color: "염색",
  bleach: "탈색",
  treatment: "트리트먼트",
  other: "기타 시술",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function nextVisitDate(serviceDate: string, days: number) {
  const date = new Date(`${serviceDate}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return "-";
  date.setDate(date.getDate() + days);
  return formatDate(date.toISOString());
}

export default function AftercareScreen() {
  const router = useRouter();
  const api = useHairfitApi();
  const [records, setRecords] = useState<MobileAftercareRecord[]>([]);
  const [message, setMessage] = useState("에프터케어 기록을 불러오는 중입니다.");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const mountedRef = useRef(true);

  const loadRecords = useCallback(async () => {
    setStatus("loading");
    setMessage("시술 확정 목록을 불러오는 중입니다.");
    try {
      const result = await api.getAftercareRecords();
      if (!mountedRef.current) return;
      setRecords(result.records);
      setMessage(result.records.length
        ? "확정한 헤어스타일의 관리 가이드를 확인하세요."
        : "아직 확정된 헤어 시술 기록이 없습니다.");
      setStatus("ready");
    } catch (error) {
      if (!mountedRef.current) return;
      setRecords([]);
      setMessage(mapMobileUserError(error, "시술 확정 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
      setStatus("error");
    }
  }, [api]);

  useEffect(() => {
    mountedRef.current = true;
    void loadRecords();
    return () => {
      mountedRef.current = false;
    };
  }, [loadRecords]);

  return (
    <CustomerScreen>
      <View style={styles.header}>
        <CustomerKicker>Care</CustomerKicker>
        <CustomerHeading>선택한 스타일을 오래, 편안하게</CustomerHeading>
        <CustomerBody>{message}</CustomerBody>
        <CustomerButton onPress={() => router.push("/consulting")}>새 컨설팅</CustomerButton>
      </View>

      {status === "loading" ? (
        <CustomerCard><CustomerBody>시술 확정 목록을 불러오는 중입니다.</CustomerBody></CustomerCard>
      ) : status === "error" ? (
        <View accessibilityRole="alert">
          <CustomerCard style={styles.contentCard}>
            <CustomerHeading compact>목록을 불러오지 못했습니다</CustomerHeading>
            <CustomerBody>{message}</CustomerBody>
            <CustomerButton onPress={() => void loadRecords()}>다시 시도</CustomerButton>
          </CustomerCard>
        </View>
      ) : records.length === 0 ? (
        <CustomerCard style={[styles.contentCard, styles.emptyCard]}>
          <CustomerKicker>Care journal</CustomerKicker>
          <CustomerHeading compact>아직 확정된 시술이 없어요</CustomerHeading>
          <CustomerBody>컨설팅 결과에서 마음에 드는 스타일을 확정하면 맞춤 케어 가이드가 자동으로 준비됩니다.</CustomerBody>
          <CustomerButton onPress={() => router.push("/consulting")}>첫 컨설팅 시작</CustomerButton>
        </CustomerCard>
      ) : (
        <View style={styles.list}>
          {records.map((record) => (
            <CustomerCard key={record.id} style={styles.recordCard}>
              <View style={styles.preview}>
                {record.selectedVariantImageUrl ? (
                  <Image
                    accessibilityLabel={`${record.styleName} 시술 확정 스타일`}
                    source={{ uri: record.selectedVariantImageUrl }}
                    style={styles.previewImage}
                  />
                ) : (
                  <View style={styles.placeholder}><CustomerBody>이미지 준비 중</CustomerBody></View>
                )}
              </View>
              <View style={styles.recordBody}>
                <CustomerKicker>{serviceLabels[record.serviceType] || record.serviceType}</CustomerKicker>
                <CustomerHeading compact>{record.styleName}</CustomerHeading>
                <CustomerBody>시술일 {formatDate(record.serviceDate)}</CustomerBody>
                <View style={styles.dueBox}>
                  <Text style={styles.dueLabel}>권장 재방문</Text>
                  <Text style={styles.dueValue}>{nextVisitDate(record.serviceDate, record.nextVisitTargetDays)}</Text>
                </View>
                <CustomerButton secondary onPress={() => router.push(`/aftercare/${record.id}`)}>가이드 열기</CustomerButton>
              </View>
            </CustomerCard>
          ))}
        </View>
      )}
    </CustomerScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  contentCard: {
    gap: 12,
  },
  emptyCard: {
    justifyContent: "center",
    minHeight: 320,
  },
  list: {
    gap: 16,
  },
  recordCard: {
    padding: 0,
  },
  preview: {
    alignItems: "center",
    aspectRatio: 4 / 5,
    backgroundColor: customerColors.raised,
    justifyContent: "center",
    overflow: "hidden",
    width: "100%",
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
  recordBody: {
    gap: 10,
    padding: 18,
  },
  dueBox: {
    borderTopColor: customerColors.line,
    borderTopWidth: 1,
    gap: 3,
    marginTop: 4,
    paddingTop: 12,
  },
  dueLabel: {
    color: customerColors.subtle,
    fontSize: 11,
  },
  dueValue: {
    color: customerColors.ivory,
    fontSize: 14,
    fontWeight: "800",
  },
});
