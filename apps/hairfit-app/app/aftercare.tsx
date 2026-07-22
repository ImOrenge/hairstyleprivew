import type { MobileAftercareRecord } from "@hairfit/shared";
import { BodyText, Button, Card, Chip, Cluster, Heading, Kicker, Panel, Screen, Stack } from "@hairfit/ui-native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useHairfitApi } from "../lib/api";
import { mapMobileUserError } from "../lib/mobile-user-message";

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
    <Screen>
      <Panel>
        <Stack>
          <Kicker>에프터케어</Kicker>
          <Heading>확정한 헤어스타일 관리 가이드</Heading>
          <BodyText>{message}</BodyText>
          <Button onPress={() => router.push("/upload")}>새 헤어 만들기</Button>
        </Stack>
      </Panel>

      {status === "loading" ? (
        <Card>
          <BodyText>시술 확정 목록을 불러오는 중입니다.</BodyText>
        </Card>
      ) : status === "error" ? (
        <View accessibilityRole="alert">
          <Card>
            <Stack>
              <Heading>목록을 불러오지 못했습니다</Heading>
              <BodyText>{message}</BodyText>
              <Button onPress={() => void loadRecords()}>다시 시도</Button>
            </Stack>
          </Card>
        </View>
      ) : records.length === 0 ? (
        <Card>
          <Stack>
            <Heading>아직 확정된 시술이 없습니다</Heading>
            <BodyText>결과 화면에서 선택한 헤어스타일을 확정하면 에프터케어 가이드가 생성됩니다.</BodyText>
            <Button onPress={() => router.push("/generate")}>결과 보러가기</Button>
          </Stack>
        </Card>
      ) : (
        <Stack>
          {records.map((record) => (
            <Card key={record.id}>
              <Stack>
                <View style={styles.preview}>
                  {record.selectedVariantImageUrl ? (
                    <Image
                      accessibilityLabel={`${record.styleName} 시술 확정 스타일`}
                      source={{ uri: record.selectedVariantImageUrl }}
                      style={styles.previewImage}
                    />
                  ) : (
                    <BodyText>확정 스타일 이미지 준비 중</BodyText>
                  )}
                </View>
                <Cluster>
                  <Chip tone="success">시술 확정</Chip>
                  <Chip>{serviceLabels[record.serviceType] || record.serviceType}</Chip>
                  <Chip>{formatDate(record.serviceDate)}</Chip>
                </Cluster>
                <Heading>{record.styleName}</Heading>
                <BodyText>권장 재방문일: {nextVisitDate(record.serviceDate, record.nextVisitTargetDays)}</BodyText>
                <Button onPress={() => router.push(`/aftercare/${record.id}`)}>가이드 열기</Button>
              </Stack>
            </Card>
          ))}
        </Stack>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: {
    alignItems: "center",
    aspectRatio: 4 / 5,
    backgroundColor: "#171812",
    justifyContent: "center",
    overflow: "hidden",
    width: "100%",
  },
  previewImage: {
    height: "100%",
    resizeMode: "cover",
    width: "100%",
  },
});
