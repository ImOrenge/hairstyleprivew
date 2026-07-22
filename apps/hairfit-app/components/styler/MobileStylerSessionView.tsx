import {
  BodyText,
  Button,
  Card,
  Chip,
  Cluster,
  Heading,
  Kicker,
  Panel,
  Stack,
} from "@hairfit/ui-native";
import { AppScreen } from "../app/AppScreen";
import { Image, StyleSheet, View } from "react-native";
import { PaidActionQuoteCard } from "../billing/PaidActionQuoteCard";
import {
  formatMobileStylerItemSlot,
} from "./mobileStylerModel";
import {
  getMobileStylerNotificationMessage,
  getMobileStylerReceiptDescription,
  getMobileStylerReceiptHeading,
  MOBILE_STYLER_GENRE_LABELS,
} from "./mobileStylerSessionModel";
import type { MobileStylerSessionController } from "./useMobileStylerSessionController";

interface MobileStylerSessionViewProps {
  controller: MobileStylerSessionController;
}

export function MobileStylerSessionView({ controller }: MobileStylerSessionViewProps) {
  const {
    handleGenerate,
    isGenerating,
    message,
    openBilling,
    openHairResult,
    openNewStyler,
    quote,
    quoteError,
    quoteExpired,
    quoteLoading,
    refreshQuote,
    session,
    statusPresentation,
  } = controller;
  const recommendation = session?.recommendation || null;
  const genre = session?.genre || recommendation?.genre || null;
  const canStart = statusPresentation.status === "recommended" || statusPresentation.status === "failed";
  const receipt = session?.creditReceipt ?? null;
  const notificationMessage = getMobileStylerNotificationMessage(session?.completionNotificationStatus);

  return (
    <AppScreen>
      <Stack>
        <Kicker>패션 룩북</Kicker>
        <Heading>{recommendation?.headline || "패션 추천 결과"}</Heading>
        <View accessibilityLiveRegion="polite" accessibilityState={{ busy: statusPresentation.status === "generating" }}>
          <BodyText>{message}</BodyText>
        </View>
        <Chip tone={statusPresentation.tone}>{statusPresentation.labelKo}</Chip>
      </Stack>

      {session ? (
        <Panel>
          <Stack>
            <View style={styles.preview}>
              {session.imageUrl ? (
                <Image
                  accessibilityLabel={`${recommendation?.headline || "패션 추천"} 룩북 생성 결과`}
                  accessibilityRole="image"
                  source={{ uri: session.imageUrl }}
                  style={styles.image}
                />
              ) : (
                <BodyText>아직 표시할 룩북 이미지가 없습니다. 현재 상태: {statusPresentation.labelKo}</BodyText>
              )}
            </View>

            {statusPresentation.status === "failed" ? (
              <View accessibilityLiveRegion="assertive">
                <Card style={styles.errorCard}>
                  <Stack gap={8}>
                    <Kicker>생성 실패 안내</Kicker>
                    <BodyText style={styles.errorText}>서버에서 룩북 이미지를 완료하지 못했습니다. 크레딧 복구 영수증과 최신 견적을 확인한 뒤 다시 시도해 주세요.</BodyText>
                  </Stack>
                </Card>
              </View>
            ) : null}

            {statusPresentation.status === "generating" ? (
              <Card>
                <Stack gap={8}>
                  <Kicker>백그라운드 생성 접수 완료</Kicker>
                  <BodyText>이 화면을 벗어나거나 앱을 종료해도 서버에서 계속 생성합니다. 앱이 열려 있는 동안에는 3초마다 상태를 자동 확인합니다.</BodyText>
                </Stack>
              </Card>
            ) : null}

            {notificationMessage ? (
              <Card>
                <Stack gap={8}>
                  <Kicker>완료 알림 상태</Kicker>
                  <BodyText>{notificationMessage}</BodyText>
                </Stack>
              </Card>
            ) : null}

            {receipt ? (
              <Card>
                <Stack gap={8}>
                  <Kicker>서버 크레딧 처리 영수증</Kicker>
                  <Heading style={styles.receiptHeading}>{getMobileStylerReceiptHeading(receipt)}</Heading>
                  <BodyText>{getMobileStylerReceiptDescription(receipt)}</BodyText>
                  <BodyText>작업 비용 {receipt.costCredits}C · 최종 잔액 {receipt.balanceAfter}C</BodyText>
                  {receipt.replayed ? <BodyText>동일 작업의 기존 처리 영수증을 다시 확인했습니다.</BodyText> : null}
                </Stack>
              </Card>
            ) : null}

            {canStart ? (
              <Stack>
                <PaidActionQuoteCard
                  error={quoteError}
                  loading={quoteLoading}
                  onOpenBilling={openBilling}
                  onRefresh={() => void refreshQuote()}
                  payerLabel="내 계정"
                  quote={quote}
                />
                <Card>
                  <BodyText>결제나 충전 후에도 자동으로 생성하지 않습니다. 최신 견적을 다시 확인하고 아래 버튼을 직접 눌러야 시작됩니다.</BodyText>
                </Card>
                <Button
                  disabled={isGenerating || quoteLoading || !quote || quoteExpired || !quote.isAllowed}
                  loading={isGenerating}
                  loadingLabel={statusPresentation.status === "failed" ? "룩북 재생성 요청 중" : "룩북 생성 요청 중"}
                  onPress={handleGenerate}
                >
                  {statusPresentation.status === "failed" ? "룩북 다시 생성" : "룩북 생성 시작"}
                </Button>
              </Stack>
            ) : null}

            <Card>
              <Stack gap={10}>
                <Kicker>추천 요약</Kicker>
                <BodyText>{recommendation?.summary || "-"}</BodyText>
                <Cluster>
                  {(recommendation?.palette || []).map((color) => <Chip key={color}>{color}</Chip>)}
                </Cluster>
                <BodyText>
                  장르: {genre ? MOBILE_STYLER_GENRE_LABELS[genre] : "맞춤 코디"} · 상태: {statusPresentation.labelKo} · 사용 크레딧: {session.creditsUsed}
                </BodyText>
              </Stack>
            </Card>

            <Card>
              <Stack>
                <Kicker>스타일링 노트</Kicker>
                {(recommendation?.stylingNotes || []).map((note) => <BodyText key={note}>{note}</BodyText>)}
              </Stack>
            </Card>

            <Cluster>
              <Button onPress={openHairResult} variant="secondary">헤어 결과로 돌아가기</Button>
              <Button onPress={openNewStyler} variant="secondary">새 패션 추천</Button>
            </Cluster>
          </Stack>
        </Panel>
      ) : null}

      {recommendation ? (
        <Stack>
          <Kicker>추천 아이템</Kicker>
          <Heading>코디 구성</Heading>
          {recommendation.items.map((item) => (
            <Card key={item.slot}>
              <Stack gap={10}>
                <Kicker>{formatMobileStylerItemSlot(item.slot)}</Kicker>
                <Heading>{item.name}</Heading>
                <BodyText>{item.description}</BodyText>
                <BodyText>색상: {item.color}</BodyText>
                <BodyText>핏: {item.fit}</BodyText>
                <BodyText>소재: {item.material}</BodyText>
                <BodyText>브랜드: {item.brandName || "브랜드 정보 없음"}</BodyText>
              </Stack>
            </Card>
          ))}
        </Stack>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  errorCard: { borderColor: "#b42318" },
  errorText: { color: "#b42318" },
  image: { height: "100%", width: "100%" },
  preview: {
    alignItems: "center",
    aspectRatio: 3 / 4,
    backgroundColor: "#eee8de",
    borderRadius: 8,
    justifyContent: "center",
    overflow: "hidden",
    width: "100%",
  },
  receiptHeading: { fontSize: 22, lineHeight: 28 },
});
