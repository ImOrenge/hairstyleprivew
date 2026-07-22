import { useRouter } from "expo-router";
import { StyleSheet } from "react-native";
import {
  BodyText,
  Button,
  Card,
  Chip,
  Cluster,
  Heading,
  Panel,
  Stack,
} from "@hairfit/ui-native";
import {
  formatMobileMyPageDate as formatDate,
  getMobileGenerationPresentation as generationPresentation,
  getMobileMyPageGenerationHref,
  type MobileCustomerDashboard,
} from "../../../lib/mypage";
import { MobileMyPageAsyncBoundary } from "../MobileMyPageAsyncBoundary";

export function MobileMyPageUsagePanel({
  generations,
}: {
  generations: MobileCustomerDashboard["customer"]["recentGenerations"];
}) {
  const router = useRouter();

  return (
    <MobileMyPageAsyncBoundary>
      <Panel>
      <Stack>
        <Heading style={styles.panelHeading}>헤어 생성 작업 현황</Heading>
        <BodyText>예약한 생성 작업의 대기·진행·완료·실패 상태를 확인합니다.</BodyText>
        {generations.length === 0 ? (
          <Card style={{ borderStyle: "dashed", paddingVertical: 28 }}>
            <Stack gap={8}>
              <BodyText style={styles.centerStrong}>진행 중이거나 완료된 생성 작업이 없습니다.</BodyText>
              <BodyText style={styles.centerText}>생성 작업을 예약하면 여기에 진행 상태가 표시됩니다.</BodyText>
            </Stack>
          </Card>
        ) : (
          generations.map((item) => (
            <Card key={item.id}>
              <Stack gap={10}>
                <Cluster>
                  <Chip tone={generationPresentation(item).tone}>{generationPresentation(item).labelKo}</Chip>
                  <Chip>{formatDate(item.createdAt)}</Chip>
                </Cluster>
                <BodyText style={styles.strongText}>{item.promptUsed || "제목 없는 생성 결과"}</BodyText>
                <BodyText>{item.id}</BodyText>
                <Button
                  variant="secondary"
                  onPress={() => router.push(getMobileMyPageGenerationHref(item))}
                >
                  열기
                </Button>
              </Stack>
            </Card>
          ))
        )}
      </Stack>
      </Panel>
    </MobileMyPageAsyncBoundary>
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
  strongText: {
    color: "#f4f1e8",
    fontWeight: "800",
  },
});
