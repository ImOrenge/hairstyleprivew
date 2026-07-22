import type { PaidActionQuote } from "@hairfit/shared";
import {
  BodyText,
  Button,
  Card,
  Heading,
  Kicker,
  MetricGrid,
  MetricTile,
  Stack,
  useThemeColors,
} from "@hairfit/ui-native";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

export interface NativePaidActionQuoteCardProps {
  quote: PaidActionQuote | null;
  loading?: boolean;
  error?: string | null;
  payerLabel: string;
  onRefresh: () => void;
  onOpenBilling: () => void;
}

export function useNativePaidActionQuoteExpired(quote: PaidActionQuote | null) {
  const [expired, setExpired] = useState(() =>
    quote ? Date.parse(quote.expiresAt) <= Date.now() : false,
  );

  useEffect(() => {
    if (!quote) {
      setExpired(false);
      return;
    }
    const remainingMs = Date.parse(quote.expiresAt) - Date.now();
    if (remainingMs <= 0) {
      setExpired(true);
      return;
    }
    setExpired(false);
    const timeout = setTimeout(() => setExpired(true), remainingMs + 25);
    return () => clearTimeout(timeout);
  }, [quote]);

  return expired;
}

function expiryLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function PaidActionQuoteCard({
  quote,
  loading = false,
  error,
  payerLabel,
  onRefresh,
  onOpenBilling,
}: NativePaidActionQuoteCardProps) {
  const theme = useThemeColors();
  const expired = useNativePaidActionQuoteExpired(quote);

  return (
    <Card>
      <Stack gap={10}>
        <Kicker>서버 크레딧 견적</Kicker>
        <View accessibilityLiveRegion="polite" accessibilityState={{ busy: loading }}>
          <Heading style={styles.heading}>
            {loading
              ? "최신 잔액 확인 중"
              : quote
                ? quote.isFree
                  ? "추가 차감 없음"
                  : `${quote.costCredits}크레딧 예약`
                : "견적 확인 필요"}
          </Heading>
        </View>
        <Button loading={loading} loadingLabel="확인 중" onPress={onRefresh} variant="secondary">
          견적 새로고침
        </Button>

        {quote ? (
          <>
            <MetricGrid>
              <MetricTile label="현재 잔액" value={`${quote.currentBalance}C`} />
              <MetricTile label="이번 작업" value={`${quote.costCredits}C`} />
              <MetricTile label="예약 후 예상" value={`${quote.balanceAfter}C`} />
            </MetricGrid>
            <BodyText>결제 주체: {payerLabel}</BodyText>
            <BodyText>{quote.failurePolicy}</BodyText>
            {quote.lockConsequence ? <BodyText>{quote.lockConsequence}</BodyText> : null}
            <BodyText>견적 유효 시간: {expiryLabel(quote.expiresAt)}</BodyText>

            {expired ? (
              <View
                accessibilityLiveRegion="assertive"
                style={[styles.alert, { backgroundColor: theme.dangerSoft, borderColor: theme.danger }]}
              >
                <Heading style={{ ...styles.alertTitle, color: theme.danger }}>견적이 만료되었습니다</Heading>
                <BodyText>최신 잔액과 비용을 다시 확인하기 전에는 작업을 실행하지 않습니다.</BodyText>
              </View>
            ) : null}

            {!expired && !quote.isAllowed ? (
              <View
                accessibilityLiveRegion="polite"
                style={[styles.alert, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}
              >
                <Heading style={styles.alertTitle}>{quote.shortfallCredits}크레딧이 부족합니다</Heading>
                <BodyText>결제 후에는 자동 실행하지 않고 최신 견적을 다시 확인합니다.</BodyText>
                <Button onPress={onOpenBilling} variant="secondary">크레딧 충전</Button>
              </View>
            ) : null}
          </>
        ) : null}

        {error ? (
          <View
            accessibilityLiveRegion="assertive"
            style={[styles.alert, { backgroundColor: theme.dangerSoft, borderColor: theme.danger }]}
          >
            <Heading style={{ ...styles.alertTitle, color: theme.danger }}>견적을 확인하지 못했습니다</Heading>
            <BodyText>{error}</BodyText>
          </View>
        ) : null}
      </Stack>
    </Card>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 22,
    lineHeight: 28,
  },
  alert: {
    borderRadius: 6,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  alertTitle: {
    fontSize: 16,
    lineHeight: 22,
  },
});
