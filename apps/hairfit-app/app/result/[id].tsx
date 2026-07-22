import { HairfitApiError } from "@hairfit/api-client";
import {
  isPaidActionQuoteExpired,
  normalizePaidActionQuote,
  resolveGenerationResultSelection,
  type GeneratedVariant,
  type PaidActionExecutionReceipt,
  type PaidActionQuote,
  type PaidActionQuoteErrorCode,
  type RecommendationSet,
  type ServiceType,
} from "@hairfit/shared";
import { BodyText, Button, Card, Chip, Cluster, Heading, Kicker, Panel, Stack, TextField } from "@hairfit/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { AppScreen } from "../../components/app/AppScreen";
import {
  PaidActionQuoteCard,
  useNativePaidActionQuoteExpired,
} from "../../components/billing/PaidActionQuoteCard";
import { useHairfitApi } from "../../lib/api";
import { useMobileResultTranslations } from "../../hooks/useMobileResultTranslations";
import { normalizePaymentResumeReturnTo } from "../../lib/payment-resume";
import { mapMobileUserError } from "../../lib/mobile-user-message";
import { useNetworkRecovery } from "../../components/app/NetworkRecoveryProvider";

interface GenerationDetail {
  id: string;
  status: string;
  recommendationSet: RecommendationSet | null;
  selectedVariant: GeneratedVariant | null;
  selectionLocked: boolean;
  confirmedHairRecord: {
    id: string;
    styleName: string;
    serviceType: string;
    serviceDate: string;
    createdAt: string;
  } | null;
}

function firstRenderableVariant(set: RecommendationSet | null) {
  return set?.variants.find((variant) => variant.outputUrl || variant.generatedImagePath) || null;
}

const serviceOptions: { value: ServiceType; label: string }[] = [
  { value: "cut", label: "커트" },
  { value: "perm", label: "펌" },
  { value: "color", label: "염색" },
  { value: "bleach", label: "탈색" },
  { value: "treatment", label: "트리트먼트" },
  { value: "other", label: "기타" },
];

const selectionLockedMessage = "확정한 헤어는 변경할 수 없습니다. 다른 스타일은 새로 생성해 주세요.";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const QUOTE_ERROR_CODES = new Set<PaidActionQuoteErrorCode>([
  "QUOTE_REQUIRED",
  "QUOTE_INVALID",
  "QUOTE_EXPIRED",
  "QUOTE_CHANGED",
  "INSUFFICIENT_CREDITS",
]);

interface AftercareSuccessReceipt {
  hairRecordId: string;
  careScheduledCount: number;
  creditReceipt: PaidActionExecutionReceipt | null;
  alreadyConfirmed: boolean;
}

function todayKey(now = new Date()) {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function isValidDateKey(value: string) {
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readQuoteErrorCode(payload: unknown): PaidActionQuoteErrorCode | null {
  if (!isRecord(payload)) return null;
  const code = payload.code;
  return typeof code === "string" && QUOTE_ERROR_CODES.has(code as PaidActionQuoteErrorCode)
    ? code as PaidActionQuoteErrorCode
    : null;
}

function readFreshAftercareQuote(payload: unknown, generationId: string) {
  if (!isRecord(payload)) return null;
  const quote = normalizePaidActionQuote(payload.quote);
  return quote?.action === "aftercare" &&
    quote.billingScope === "customer" &&
    quote.subjectId === generationId
    ? quote
    : null;
}

function readConfirmedHairRecord(payload: unknown): GenerationDetail["confirmedHairRecord"] {
  if (!isRecord(payload) || !isRecord(payload.confirmedHairRecord)) return null;
  const record = payload.confirmedHairRecord;
  if (typeof record.id !== "string" || !UUID_PATTERN.test(record.id)) return null;
  return {
    id: record.id,
    styleName: typeof record.styleName === "string" ? record.styleName : "확정한 헤어스타일",
    serviceType: typeof record.serviceType === "string" ? record.serviceType : "other",
    serviceDate: typeof record.serviceDate === "string" ? record.serviceDate : "",
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
  };
}

function quoteRequestErrorMessage(error: unknown) {
  if (error instanceof HairfitApiError) {
    if (error.status === 401) return "최신 견적을 확인하려면 다시 로그인해 주세요.";
    if (error.status === 403) return "현재 계정으로는 이 에프터케어 견적을 확인할 수 없습니다.";
    if (error.status === 404) return "이 헤어 결과를 찾을 수 없습니다. 결과 목록에서 다시 열어 주세요.";
  }
  return "최신 크레딧 견적을 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.";
}

function quoteRefreshMessage(code: PaidActionQuoteErrorCode | null, quote: PaidActionQuote) {
  if (code === "INSUFFICIENT_CREDITS" || !quote.isAllowed) {
    return `크레딧이 ${quote.shortfallCredits} 부족합니다. 충전 후 최신 견적을 다시 확인해 주세요.`;
  }
  if (code === "QUOTE_EXPIRED") {
    return "견적 유효 시간이 지나 최신 견적을 불러왔습니다. 비용을 확인한 뒤 다시 만들어 주세요.";
  }
  if (code === "QUOTE_CHANGED") {
    return "무료 혜택 또는 잔액이 변경되어 최신 견적을 불러왔습니다. 내용을 확인한 뒤 다시 만들어 주세요.";
  }
  return "최신 에프터케어 견적을 불러왔습니다. 내용을 확인한 뒤 다시 만들어 주세요.";
}

function aftercareExecutionErrorMessage(error: unknown) {
  if (error instanceof HairfitApiError) {
    if (error.status === 401) return "에프터케어를 만들려면 다시 로그인해 주세요.";
    if (error.status === 403) return "현재 계정으로는 이 헤어 결과를 확정할 수 없습니다.";
    if (error.status === 404) return "헤어 결과를 찾을 수 없습니다. 결과 목록에서 다시 열어 주세요.";
    if (error.status === 400) return "선택한 스타일과 시술일을 다시 확인해 주세요.";
  }
  return "에프터케어 처리 결과를 확인하지 못했습니다. 최신 견적을 확인한 뒤 같은 요청으로 다시 시도해 주세요.";
}

function serviceLabel(value: string) {
  return serviceOptions.find((option) => option.value === value)?.label ?? value;
}

function receiptHeading(receipt: PaidActionExecutionReceipt | null) {
  if (!receipt) return "시술 기록 확정 완료";
  if (receipt.state === "free") {
    return receipt.freeReason === "first_aftercare_program"
      ? "첫 에프터케어 무료 적용"
      : "추가 크레딧 차감 없음";
  }
  if (receipt.state === "charged") return `${receipt.chargedCredits}크레딧 차감 완료`;
  if (receipt.state === "refunded") return `${receipt.refundedCredits}크레딧 복구 완료`;
  return `${receipt.costCredits}크레딧 예약 완료`;
}

export default function ResultDetailScreen() {
  const router = useRouter();
  const api = useHairfitApi();
  const { recoveryToken } = useNetworkRecovery();
  const { id, variant } = useLocalSearchParams<{ id: string; variant?: string }>();
  const generationId = typeof id === "string" ? id : "";
  const variantFromRoute = typeof variant === "string" ? variant : "";
  const [detail, setDetail] = useState<GenerationDetail | null>(null);
  const [message, setMessage] = useState<string | null>("결과를 불러오는 중입니다.");
  const [messageIsError, setMessageIsError] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
  const [serviceType, setServiceType] = useState<ServiceType>("cut");
  const [serviceDate, setServiceDate] = useState(todayKey());
  const [aftercarePending, setAftercarePending] = useState(false);
  const [aftercareSuccess, setAftercareSuccess] = useState<AftercareSuccessReceipt | null>(null);
  const [quote, setQuote] = useState<PaidActionQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const quoteRequestIdRef = useRef(0);

  const showMessage = useCallback((text: string | null, isError = false) => {
    setMessage(text);
    setMessageIsError(isError);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!generationId) return;
      setDetail(null);
      setAftercareSuccess(null);
      showMessage("결과를 불러오는 중입니다.");
      try {
        const result = await api.getGeneration(generationId);
        if (!cancelled) {
          const selection = resolveGenerationResultSelection({
            recommendationSet: result.recommendationSet,
            selectedVariant: result.selectedVariant,
            confirmedHairRecord: result.confirmedHairRecord,
            requestedVariantId: variantFromRoute,
          });
          void api.recordGenerationResultOpened(generationId, "mobile").catch(() => undefined);
          setDetail({
            id: result.id,
            status: result.status,
            recommendationSet: result.recommendationSet,
            selectedVariant: result.selectedVariant as GeneratedVariant | null,
            selectionLocked: selection.selectionLocked,
            confirmedHairRecord: result.confirmedHairRecord ?? null,
          });
          showMessage(
            selection.selectionLocked && selection.requestedVariantIgnored
              ? selectionLockedMessage
              : selection.selectionLocked && result.confirmedHairRecord
                ? "이미 확정된 시술 기록입니다. 기존 에프터케어 가이드를 열 수 있습니다."
                : "결과를 불러왔습니다.",
          );
        }
      } catch (error) {
        if (!cancelled) {
          showMessage(mapMobileUserError(error, "결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."), true);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, generationId, recoveryToken, showMessage, variantFromRoute]);

  const selectVariant = async (variant: GeneratedVariant) => {
    if (!generationId || pendingSelection) return;
    const lockedSelectedVariantId = detail?.recommendationSet?.selectedVariantId || detail?.selectedVariant?.id || "";
    if (detail?.selectionLocked && variant.id !== lockedSelectedVariantId) {
      showMessage(selectionLockedMessage, true);
      return;
    }

    setPendingSelection(variant.id);
    showMessage(null);
    try {
      await api.patchSelectedVariant(generationId, variant.id);
      setDetail((current) => {
        if (!current?.recommendationSet) return current;
        return {
          ...current,
          recommendationSet: {
            ...current.recommendationSet,
            selectedVariantId: variant.id,
          },
          selectedVariant: variant,
        };
      });
      showMessage("선택한 스타일을 저장했습니다.");
    } catch (error) {
      showMessage(
        error instanceof HairfitApiError && error.status === 409
          ? selectionLockedMessage
          : mapMobileUserError(error, "선택한 스타일을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."),
        true,
      );
    } finally {
      setPendingSelection(null);
    }
  };

  const primary = useMemo(() => {
    const variants = detail?.recommendationSet?.variants || [];
    const selection = resolveGenerationResultSelection({
      recommendationSet: detail?.recommendationSet,
      selectedVariant: detail?.selectedVariant,
      confirmedHairRecord: detail?.confirmedHairRecord,
      requestedVariantId: variantFromRoute,
    });
    return (
      variants.find((item) => item.id === selection.selectedVariantId) ||
      detail?.selectedVariant ||
      firstRenderableVariant(detail?.recommendationSet ?? null)
    );
  }, [detail, variantFromRoute]);
  const resultVariants = detail?.recommendationSet?.variants || [];
  const translate = useMobileResultTranslations([
    primary?.label,
    primary?.reason,
    ...resultVariants.flatMap((item) => [item.label, item.reason, ...item.tags]),
  ]);
  const primaryLabel = primary
    ? translate(primary.label, `추천 스타일 ${primary.rank}`)
    : "HairFit 결과";
  const imageUrl = primary?.outputUrl || null;
  const confirmedAftercare = detail?.selectionLocked ? detail.confirmedHairRecord : null;
  const quoteExpired = useNativePaidActionQuoteExpired(quote);
  const serviceDateError = !serviceDate
    ? "시술일을 입력해 주세요."
    : !isValidDateKey(serviceDate)
      ? "실제 달력 날짜를 YYYY-MM-DD 형식으로 입력해 주세요."
      : null;
  const aftercareReturnTo = useMemo(
    () => normalizePaymentResumeReturnTo(
      generationId && primary?.id
        ? `/result/${generationId}?variant=${encodeURIComponent(primary.id)}`
        : null,
    ),
    [generationId, primary?.id],
  );

  const refreshQuote = useCallback(async () => {
    if (!generationId || confirmedAftercare) {
      setQuote(null);
      setQuoteError(null);
      return null;
    }

    const requestId = ++quoteRequestIdRef.current;
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const response = await api.createPaidActionQuote({
        action: "aftercare",
        subjectId: generationId,
        billingScope: "customer",
      });
      const normalized = normalizePaidActionQuote(response.quote);
      if (
        !normalized ||
        normalized.action !== "aftercare" ||
        normalized.billingScope !== "customer" ||
        normalized.subjectId !== generationId
      ) {
        throw new Error("QUOTE_CONTEXT_MISMATCH");
      }
      if (requestId !== quoteRequestIdRef.current) return null;
      setQuote(normalized);
      return normalized;
    } catch (error) {
      if (requestId !== quoteRequestIdRef.current) return null;
      setQuoteError(quoteRequestErrorMessage(error));
      return null;
    } finally {
      if (requestId === quoteRequestIdRef.current) setQuoteLoading(false);
    }
  }, [api, confirmedAftercare, generationId]);

  useEffect(() => {
    quoteRequestIdRef.current += 1;
    setQuote(null);
    setQuoteError(null);
    setQuoteLoading(false);
    if (!detail || confirmedAftercare) return;
    void refreshQuote();
    return () => {
      quoteRequestIdRef.current += 1;
    };
  }, [confirmedAftercare, detail, refreshQuote]);

  const createAftercare = async () => {
    if (!generationId || !primary?.id || aftercarePending) return;
    if (confirmedAftercare) {
      router.push(`/aftercare/${confirmedAftercare.id}`);
      return;
    }
    if (!isValidDateKey(serviceDate)) {
      showMessage("시술일을 실제 달력 날짜와 YYYY-MM-DD 형식으로 확인해 주세요.", true);
      return;
    }
    if (!quote || quote.subjectId !== generationId || isPaidActionQuoteExpired(quote)) {
      const wasExpired = Boolean(quote && isPaidActionQuoteExpired(quote));
      const refreshedQuote = await refreshQuote();
      if (refreshedQuote) {
        showMessage(
          wasExpired
            ? "견적이 만료되어 최신 견적을 불러왔습니다. 내용을 확인한 뒤 만들기 버튼을 다시 눌러 주세요."
            : "최신 에프터케어 견적을 준비했습니다. 내용을 확인한 뒤 만들기 버튼을 다시 눌러 주세요.",
        );
      }
      return;
    }
    if (!quote.isAllowed) {
      showMessage(
        `크레딧이 ${quote.shortfallCredits} 부족합니다. 충전 후 최신 견적을 다시 확인해 주세요.`,
        true,
      );
      return;
    }

    setAftercarePending(true);
    showMessage("시술 기록과 에프터케어 일정을 안전하게 확정하고 있습니다.");
    try {
      const result = await api.createHairRecord({
        generationId,
        selectedVariantId: primary.id,
        serviceType,
        serviceDate,
        quoteId: quote.quoteId,
      });
      const creditReceipt = result.creditReceipt ?? null;
      const confirmedRecord: NonNullable<GenerationDetail["confirmedHairRecord"]> = {
        id: result.hairRecordId,
        styleName: result.styleName,
        serviceType: result.serviceType,
        serviceDate: result.serviceDate,
        createdAt: new Date().toISOString(),
      };
      setDetail((current) => current
        ? {
            ...current,
            selectionLocked: true,
            confirmedHairRecord: confirmedRecord,
          }
        : current);
      quoteRequestIdRef.current += 1;
      setQuote(null);
      setQuoteError(null);
      setQuoteLoading(false);
      setAftercareSuccess({
        hairRecordId: result.hairRecordId,
        careScheduledCount: result.careScheduledCount,
        creditReceipt,
        alreadyConfirmed: Boolean(result.alreadyConfirmed),
      });
      showMessage(
        result.alreadyConfirmed
          ? "이미 확정된 에프터케어 기록과 처리 영수증을 다시 확인했습니다."
          : `${result.styleName} 가이드와 ${result.careScheduledCount}개의 케어 일정을 만들었습니다.`,
      );
    } catch (error) {
      if (error instanceof HairfitApiError) {
        const confirmedRecord = readConfirmedHairRecord(error.payload);
        if (error.status === 409 && confirmedRecord) {
          quoteRequestIdRef.current += 1;
          setQuote(null);
          setQuoteError(null);
          setDetail((current) => current
            ? {
                ...current,
                selectionLocked: true,
                confirmedHairRecord: confirmedRecord,
              }
            : current);
          showMessage("이미 확정된 시술 기록입니다. 기존 에프터케어 가이드를 열어 주세요.");
          return;
        }

        const quoteCode = readQuoteErrorCode(error.payload);
        const freshQuote = readFreshAftercareQuote(error.payload, generationId);
        if (freshQuote) {
          quoteRequestIdRef.current += 1;
          setQuote(freshQuote);
          setQuoteError(null);
          setQuoteLoading(false);
          showMessage(
            quoteRefreshMessage(quoteCode, freshQuote),
            quoteCode === "INSUFFICIENT_CREDITS" || !freshQuote.isAllowed,
          );
          return;
        }
        if (quoteCode) {
          const refreshedQuote = await refreshQuote();
          showMessage(
            refreshedQuote
              ? quoteRefreshMessage(quoteCode, refreshedQuote)
              : "견적을 다시 확인하지 못했습니다. 견적 새로고침을 눌러 다시 시도해 주세요.",
            quoteCode === "INSUFFICIENT_CREDITS" || !refreshedQuote,
          );
          return;
        }
      }
      showMessage(
        aftercareExecutionErrorMessage(error),
        true,
      );
    } finally {
      setAftercarePending(false);
    }
  };

  return (
    <AppScreen>
      <Stack>
        <Kicker>결과</Kicker>
        <Heading>{primaryLabel}</Heading>
        <BodyText>생성 ID: {generationId || "알 수 없음"}</BodyText>
      </Stack>

      <Panel>
        <Stack>
          <View style={styles.preview}>
            {imageUrl ? (
              <Image
                accessibilityLabel={`${primaryLabel || "선택한 헤어스타일"} 상세 결과`}
                accessibilityRole="image"
                resizeMode="contain"
                source={{ uri: imageUrl }}
                style={styles.image}
              />
            ) : <BodyText>아직 렌더링된 이미지가 없습니다.</BodyText>}
          </View>

          {primary ? (
            <Card>
              <Stack gap={10}>
                <Kicker>디자이너 브리프</Kicker>
                <BodyText>{translate(primary.reason, "얼굴형과 전체 균형을 고려한 추천 스타일입니다.")}</BodyText>
                <Cluster>
                  {(primary.tags || []).slice(0, 6).map((tag, tagIndex) => (
                    <Chip key={tag}>{translate(tag, `스타일 특징 ${tagIndex + 1}`)}</Chip>
                  ))}
                </Cluster>
              </Stack>
            </Card>
          ) : null}

          {detail?.recommendationSet ? (
            <Stack>
              <Kicker>후보 스타일</Kicker>
              {detail.recommendationSet.variants.map((variant) => {
                const displayLabel = translate(variant.label, `추천 스타일 ${variant.rank}`);
                return (
                <Card key={variant.id}>
                  <Stack gap={10}>
                    <Heading>{displayLabel}</Heading>
                    <BodyText>상태: {variant.status}</BodyText>
                    <Button
                      disabled={!variant.outputUrl || pendingSelection === variant.id}
                      onPress={() => selectVariant(variant)}
                    >
                      {detail.recommendationSet?.selectedVariantId === variant.id
                        ? "선택됨"
                        : pendingSelection === variant.id
                          ? "저장 중..."
                          : "이 결과 선택"}
                    </Button>
                  </Stack>
                </Card>
                );
              })}
            </Stack>
          ) : null}

          <Panel>
            <Stack>
              <Kicker>에프터케어</Kicker>
              <Heading>
                {confirmedAftercare ? "확정한 에프터케어 가이드" : "선택한 스타일을 시술 기록으로 확정"}
              </Heading>

              {aftercareSuccess ? (
                <Card>
                  <Stack gap={10}>
                    <Kicker>서버 처리 영수증</Kicker>
                    <Heading>{receiptHeading(aftercareSuccess.creditReceipt)}</Heading>
                    <BodyText>
                      {aftercareSuccess.careScheduledCount}개의 케어 일정과 시술 기록을 확인했습니다.
                    </BodyText>
                    {aftercareSuccess.creditReceipt ? (
                      <>
                        <BodyText>
                          처리 후 잔액 {aftercareSuccess.creditReceipt.balanceAfter}크레딧
                        </BodyText>
                        {aftercareSuccess.creditReceipt.replayed || aftercareSuccess.alreadyConfirmed ? (
                          <BodyText>동일 요청의 기존 영수증을 다시 확인했으며 중복 차감하지 않았습니다.</BodyText>
                        ) : null}
                      </>
                    ) : null}
                  </Stack>
                </Card>
              ) : null}

              {confirmedAftercare ? (
                <Card>
                  <Stack gap={10}>
                    <Heading>{confirmedAftercare.styleName}</Heading>
                    <BodyText>
                      시술일 {confirmedAftercare.serviceDate || "기록 확인 필요"} · {serviceLabel(confirmedAftercare.serviceType)}
                    </BodyText>
                    <BodyText>
                      시술 기록이 확정되어 다른 후보로 변경할 수 없습니다. 기존 가이드와 일정을 이어서 확인해 주세요.
                    </BodyText>
                    <Button onPress={() => router.push(`/aftercare/${confirmedAftercare.id}`)}>
                      기존 에프터케어 가이드 열기
                    </Button>
                  </Stack>
                </Card>
              ) : (
                <>
                  <BodyText>
                    시술 기록을 확정하면 첫 에프터케어는 무료, 이후 프로그램은 서버 견적에 따라 30크레딧이 적용됩니다.
                  </BodyText>
                  <Cluster>
                    {serviceOptions.map((option) => (
                      <Button
                        key={option.value}
                        accessibilityState={{ selected: serviceType === option.value }}
                        disabled={aftercarePending}
                        variant={serviceType === option.value ? "primary" : "secondary"}
                        onPress={() => setServiceType(option.value)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </Cluster>
                  <TextField
                    autoCapitalize="none"
                    editable={!aftercarePending}
                    error={serviceDateError}
                    helper="한국 시간 기준 오늘 날짜가 기본값입니다. 예: 2026-07-15"
                    label="시술일"
                    maxLength={10}
                    onChangeText={setServiceDate}
                    placeholder="YYYY-MM-DD"
                    value={serviceDate}
                  />
                  <PaidActionQuoteCard
                    error={quoteError}
                    loading={quoteLoading}
                    onOpenBilling={() => router.push(
                      `/billing?returnTo=${encodeURIComponent(aftercareReturnTo)}`,
                    )}
                    onRefresh={() => void refreshQuote()}
                    payerLabel="내 HairFit 계정"
                    quote={quote}
                  />
                  <Button
                    accessibilityState={{ busy: aftercarePending || quoteLoading }}
                    disabled={
                      !primary?.id ||
                      !isValidDateKey(serviceDate) ||
                      aftercarePending ||
                      quoteLoading ||
                      Boolean(quote && !quoteExpired && !quote.isAllowed)
                    }
                    onPress={createAftercare}
                  >
                    {aftercarePending
                      ? "시술 기록과 6개 일정 생성 중..."
                      : quoteLoading
                        ? "최신 견적 확인 중"
                        : !quote || quote.subjectId !== generationId || quoteExpired
                          ? "최신 에프터케어 견적 확인"
                          : !quote.isAllowed
                            ? "크레딧 부족 · 충전 필요"
                            : quote.isFree
                              ? "에프터케어 만들기 · 첫 프로그램 무료"
                              : `에프터케어 만들기 · ${quote.costCredits}크레딧`}
                  </Button>
                </>
              )}
            </Stack>
          </Panel>

          {message ? (
            <View
              accessibilityLiveRegion={messageIsError ? "assertive" : "polite"}
              accessibilityRole={messageIsError ? "alert" : undefined}
            >
              <BodyText>{message}</BodyText>
            </View>
          ) : null}
          <Button
            disabled={!primary?.id}
            onPress={() =>
              router.push(`/styler/new?generationId=${encodeURIComponent(generationId)}&variant=${encodeURIComponent(primary?.id || "")}`)
            }
          >
            패션 스타일러로 계속
          </Button>
          <Button variant="secondary" onPress={() => router.push(`/generate/${generationId}`)}>3x3 보드 열기</Button>
          <Button variant="secondary" onPress={() => router.push("/mypage")}>마이페이지 열기</Button>
        </Stack>
      </Panel>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  preview: {
    alignItems: "center",
    aspectRatio: 3 / 5,
    backgroundColor: "#eee8de",
    borderRadius: 8,
    justifyContent: "center",
    overflow: "hidden",
    width: "100%",
  },
  image: {
    height: "100%",
    width: "100%",
  },
});
