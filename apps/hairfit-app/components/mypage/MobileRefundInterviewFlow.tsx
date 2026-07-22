import {
  REFUND_REASON_CATEGORIES,
  type RefundOutcome,
  type RefundQuote,
  type RefundReasonCategory,
  type RefundRequestSummary,
} from "@hairfit/shared";
import { BodyText, Button, Card, Heading, Stack, TextField, useThemeColors } from "@hairfit/ui-native";
import * as Crypto from "expo-crypto";
import { useState } from "react";
import { AccessibilityInfo, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useHairfitApi } from "../../lib/api";
import { mapMobileUserError } from "../../lib/mobile-user-message";

const STEPS = ["종료 방식", "환불 사유", "상세 확인", "환불 명세", "최종 동의"];
const REASON_LABELS: Record<RefundReasonCategory, string> = {
  changed_mind: "단순 변심",
  accidental_renewal: "결제 또는 갱신 실수",
  price: "가격 부담",
  quality_expectation: "기대했던 결과와 다름",
  technical_issue: "서비스 장애 또는 기술 문제",
  duplicate_charge: "중복 결제",
  unauthorized_charge: "승인하지 않은 결제",
  privacy_or_safety: "개인정보 또는 안전 문제",
  other: "기타",
};

function formatKrw(value: number) {
  return `${Math.max(0, value).toLocaleString("ko-KR")} KRW`;
}

export function MobileRefundInterviewFlow({
  paymentTransactionId,
  onSubmitted,
}: {
  paymentTransactionId: string;
  onSubmitted?: (request: RefundRequestSummary) => void;
}) {
  const api = useHairfitApi();
  const theme = useThemeColors();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [outcome, setOutcome] = useState<RefundOutcome>("immediate_refund_and_cancel");
  const [reasonCategory, setReasonCategory] = useState<RefundReasonCategory>("changed_mind");
  const [detail, setDetail] = useState("");
  const [affectedFeature, setAffectedFeature] = useState("");
  const [quote, setQuote] = useState<RefundQuote | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<RefundRequestSummary | null>(null);

  function resetAndClose() {
    if (busy) return;
    setOpen(false);
    setStep(0);
    setQuote(null);
    setAccepted(false);
    setError(null);
    setSubmitted(null);
  }

  async function createQuote() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.createRefundQuote({
        paymentTransactionId,
        outcome,
        reasonCategory,
        answers: { detail: detail.trim(), affectedFeature: affectedFeature.trim() || null },
      });
      setQuote(result.quote);
      setStep(3);
      AccessibilityInfo.announceForAccessibility(`예상 환불액 ${formatKrw(result.quote.refundAmountKrw)}`);
    } catch (requestError) {
      setError(mapMobileUserError(requestError, "환불 견적을 만들지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!quote || !accepted) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.submitRefundRequest({
        quoteId: quote.id,
        idempotencyKey: Crypto.randomUUID(),
        acceptedAmountKrw: quote.refundAmountKrw,
        outcome,
        reasonCategory,
        answers: { detail: detail.trim(), affectedFeature: affectedFeature.trim() || null },
      });
      setSubmitted(result.refundRequest);
      onSubmitted?.(result.refundRequest);
      AccessibilityInfo.announceForAccessibility("환불 또는 구독 종료 요청이 접수되었습니다.");
    } catch (requestError) {
      setError(mapMobileUserError(requestError, "환불 요청을 접수하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  const canAdvance = step < 2 || detail.trim().length >= 5;

  return (
    <>
      <Button variant="secondary" onPress={() => setOpen(true)}>환불·구독 종료</Button>
      <Modal
        animationType="slide"
        presentationStyle="pageSheet"
        visible={open}
        onRequestClose={resetAndClose}
      >
        <View style={[styles.modal, { backgroundColor: theme.background }]}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Stack>
              <View style={styles.headerRow}>
                <Heading>{submitted ? "요청이 접수되었습니다" : "환불 및 구독 종료"}</Heading>
                <Button variant="ghost" disabled={busy} onPress={resetAndClose}>닫기</Button>
              </View>
              {!submitted ? (
                <View accessibilityLabel={`환불 인터뷰 ${step + 1}단계: ${STEPS[step]}`} style={styles.steps}>
                  {STEPS.map((label, index) => (
                    <View key={label} style={[styles.step, { borderColor: index === step ? theme.accent : theme.border }]}>
                      <Text style={{ color: index === step ? theme.text : theme.muted }}>{index + 1}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {submitted ? (
                <Card>
                  <Stack>
                    <Heading>{submitted.status === "manual_review_required" ? "담당자 검토 중" : submitted.status === "period_end_scheduled" ? "다음 갱신 중단 완료" : "자동 환불 처리 중"}</Heading>
                    <BodyText>요청 번호 {submitted.id}</BodyText>
                    <BodyText>앱을 종료해도 마이페이지에서 상태를 다시 확인할 수 있습니다.</BodyText>
                  </Stack>
                </Card>
              ) : null}

              {!submitted && step === 0 ? (
                <Stack>
                  <Heading style={styles.sectionHeading}>원하는 종료 방식을 선택하세요.</Heading>
                  {(["immediate_refund_and_cancel", "cancel_at_period_end"] as const).map((value) => (
                    <Pressable
                      key={value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: outcome === value }}
                      onPress={() => setOutcome(value)}
                      style={[styles.option, { borderColor: outcome === value ? theme.accent : theme.border, backgroundColor: theme.surface }]}
                    >
                      <Text style={[styles.optionTitle, { color: theme.text }]}>{value === "immediate_refund_and_cancel" ? "즉시 차등 환불" : "다음 갱신 중단"}</Text>
                      <BodyText>{value === "immediate_refund_and_cancel" ? "남은 결제분 크레딧을 회수하고 비례 환불한 뒤 즉시 종료합니다." : "현재 이용권을 유지하고 다음 정기결제만 중단합니다."}</BodyText>
                    </Pressable>
                  ))}
                </Stack>
              ) : null}

              {!submitted && step === 1 ? (
                <Stack>
                  <Heading style={styles.sectionHeading}>가장 가까운 사유를 선택하세요.</Heading>
                  {REFUND_REASON_CATEGORIES.map((value) => (
                    <Pressable
                      key={value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: reasonCategory === value }}
                      onPress={() => setReasonCategory(value)}
                      style={[styles.option, { borderColor: reasonCategory === value ? theme.accent : theme.border, backgroundColor: theme.surface }]}
                    >
                      <Text style={[styles.optionTitle, { color: theme.text }]}>{REASON_LABELS[value]}</Text>
                    </Pressable>
                  ))}
                </Stack>
              ) : null}

              {!submitted && step === 2 ? (
                <Stack>
                  <TextField
                    label="어떤 일이 있었나요?"
                    multiline
                    numberOfLines={5}
                    maxLength={500}
                    value={detail}
                    onChangeText={setDetail}
                    helper={`${detail.length}/500 · 사용량은 서버 기록으로 확인합니다.`}
                    error={detail.length > 0 && detail.trim().length < 5 ? "5자 이상 입력해 주세요." : undefined}
                  />
                  {reasonCategory === "technical_issue" ? (
                    <TextField label="문제가 발생한 기능" value={affectedFeature} onChangeText={setAffectedFeature} maxLength={80} />
                  ) : null}
                </Stack>
              ) : null}

              {!submitted && step === 3 && quote ? (
                <Card>
                  <Stack>
                    <Heading style={styles.sectionHeading}>환불 명세</Heading>
                    <BodyText>원 결제액 {formatKrw(quote.originalAmountKrw)}</BodyText>
                    <BodyText>지급 / 사용 / 잔여 {quote.creditsGranted} / {quote.creditsUsed} / {quote.creditsRemaining} 크레딧</BodyText>
                    <BodyText>회수 {quote.creditsToClawBack} · 다른 출처 보존 {quote.preservedCredits} 크레딧</BodyText>
                    <Text style={[styles.total, { color: theme.text }]}>예상 환불액 {formatKrw(quote.refundAmountKrw)}</Text>
                    <BodyText>{quote.decision === "manual" ? "안전한 처리를 위해 담당자가 검토합니다." : quote.decision === "period_end" ? "환불 없이 현재 기간 종료일까지 이용합니다." : "현재 기록이 일치해 자동 처리 대상입니다."}</BodyText>
                  </Stack>
                </Card>
              ) : null}

              {!submitted && step === 4 && quote ? (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: accepted }}
                  onPress={() => setAccepted((value) => !value)}
                  style={[styles.option, { borderColor: accepted ? theme.accent : theme.border, backgroundColor: theme.surface }]}
                >
                  <Text style={[styles.optionTitle, { color: theme.text }]}>{accepted ? "☑" : "☐"} 환불액, 크레딧 회수량과 종료 시점을 확인했습니다.</Text>
                </Pressable>
              ) : null}

              {error ? (
                <View accessibilityLiveRegion="assertive" accessibilityRole="alert">
                  <Card style={{ borderColor: theme.danger }}><BodyText style={{ color: theme.danger }}>{error}</BodyText></Card>
                </View>
              ) : null}
            </Stack>
          </ScrollView>

          {!submitted ? (
            <View style={[styles.footer, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              <Button variant="secondary" disabled={busy || step === 0} onPress={() => setStep((value) => Math.max(0, value - 1))}>이전</Button>
              {step < 2 ? <Button disabled={busy} onPress={() => setStep(step + 1)}>다음</Button> : null}
              {step === 2 ? <Button disabled={busy || !canAdvance} loading={busy} onPress={() => void createQuote()}>환불 명세 확인</Button> : null}
              {step === 3 ? <Button disabled={busy || !quote} onPress={() => setStep(4)}>최종 확인</Button> : null}
              {step === 4 ? <Button disabled={busy || !accepted} loading={busy} onPress={() => void submit()}>요청 확정</Button> : null}
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1 },
  content: { padding: 20, paddingBottom: 120 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  steps: { flexDirection: "row", gap: 6 },
  step: { flex: 1, minHeight: 36, alignItems: "center", justifyContent: "center", borderBottomWidth: 2 },
  sectionHeading: { fontSize: 18, lineHeight: 24 },
  option: { gap: 6, borderWidth: 1, borderRadius: 3, padding: 14 },
  optionTitle: { fontSize: 15, lineHeight: 21, fontWeight: "800" },
  total: { fontSize: 18, lineHeight: 25, fontWeight: "900" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", justifyContent: "space-between", gap: 10, borderTopWidth: 1, padding: 16 },
});
