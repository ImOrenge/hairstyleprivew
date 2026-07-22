import { useRouter } from "expo-router";
import { Image, StyleSheet, View } from "react-native";
import type { MobileConfirmedStyle } from "@hairfit/shared";
import { BodyText, Button, Card, Chip, Cluster, Heading, Panel, Stack } from "@hairfit/ui-native";
import { MobileMyPageAsyncBoundary } from "../MobileMyPageAsyncBoundary";

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

export function MobileMyPageAftercarePanel({
  confirmedStyles,
}: {
  confirmedStyles: MobileConfirmedStyle[];
}) {
  const router = useRouter();

  return (
    <MobileMyPageAsyncBoundary>
      <Panel>
      <Stack>
        <Heading style={styles.panelHeading}>시술 확정 목록</Heading>
        <BodyText>실제로 시술하기로 확정한 스타일과 관리 가이드입니다.</BodyText>
        {confirmedStyles.length === 0 ? (
          <Card style={styles.emptyCard}>
            <BodyText>아직 시술 확정한 스타일이 없습니다.</BodyText>
          </Card>
        ) : (
          confirmedStyles.map((record) => (
            <Card key={record.id}>
              <Stack gap={10}>
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
                </Cluster>
                <Heading>{record.styleName}</Heading>
                <BodyText>시술일 {formatDate(record.serviceDate)}</BodyText>
                <Button variant="secondary" onPress={() => router.push(`/aftercare/${record.id}`)}>
                  관리 가이드 보기
                </Button>
              </Stack>
            </Card>
          ))
        )}
        <Button variant="secondary" onPress={() => router.push("/aftercare")}>
          시술 확정 전체 보기
        </Button>
      </Stack>
      </Panel>
    </MobileMyPageAsyncBoundary>
  );
}

const styles = StyleSheet.create({
  emptyCard: {
    borderStyle: "dashed",
  },
  panelHeading: {
    fontSize: 22,
    lineHeight: 28,
  },
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
