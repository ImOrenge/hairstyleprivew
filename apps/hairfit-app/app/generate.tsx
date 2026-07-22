import { HairfitApiError } from "@hairfit/api-client";
import {
  getGenerationJobProgressPresentation,
  isPaidActionQuoteExpired,
  normalizeGenerationCreditReceipt,
  normalizePaidActionQuote,
  type GenerationCreditReceipt,
  type PaidActionQuote,
  type PaidActionQuoteErrorCode,
} from "@hairfit/shared";
import { BodyText, Button, Card, Heading, Kicker, Panel, Stack } from "@hairfit/ui-native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { AppScreen } from "../components/app/AppScreen";
import {
  PaidActionQuoteCard,
  useNativePaidActionQuoteExpired,
} from "../components/billing/PaidActionQuoteCard";
import { GenerationJobProgressCard } from "../components/generation/GenerationJobProgressCard";
import { useSafeBackNavigation } from "../hooks/useSafeBackNavigation";
import { useHairfitApi } from "../lib/api";
import { useGenerationFlow } from "../lib/generation-flow";

function readRedirectTo(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("redirectTo" in payload)) {
    return null;
  }
  const redirectTo = (payload as { redirectTo?: unknown }).redirectTo;
  return typeof redirectTo === "string" && redirectTo.trim() ? redirectTo : null;
}

const QUOTE_ERROR_CODES = new Set<PaidActionQuoteErrorCode>([
  "QUOTE_REQUIRED",
  "QUOTE_INVALID",
  "QUOTE_EXPIRED",
  "QUOTE_CHANGED",
  "INSUFFICIENT_CREDITS",
]);

function readQuoteErrorCode(payload: unknown): PaidActionQuoteErrorCode | null {
  if (!payload || typeof payload !== "object" || !("code" in payload)) return null;
  const code = (payload as { code?: unknown }).code;
  return typeof code === "string" && QUOTE_ERROR_CODES.has(code as PaidActionQuoteErrorCode)
    ? code as PaidActionQuoteErrorCode
    : null;
}

function readFreshGenerationQuote(payload: unknown, draftId: string) {
  if (!payload || typeof payload !== "object" || !("quote" in payload)) return null;
  const quote = normalizePaidActionQuote((payload as { quote?: unknown }).quote);
  return quote?.action === "hair_generation" &&
    quote.billingScope === "customer" &&
    quote.subjectId === draftId
    ? quote
    : null;
}

function quoteRequestErrorMessage(error: unknown) {
  if (error instanceof HairfitApiError) {
    if (error.status === 401) return "최신 견적을 확인하려면 다시 로그인해 주세요.";
    if (error.status === 403) return "현재 계정으로는 이 크레딧 견적을 확인할 수 없습니다.";
    if (error.status === 410) return "사진 업로드 영수증이 만료되었습니다. 사진을 다시 업로드해 주세요.";
  }
  return "최신 크레딧 견적을 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.";
}

function quoteRefreshMessage(code: PaidActionQuoteErrorCode | null, quote: PaidActionQuote) {
  if (code === "INSUFFICIENT_CREDITS" || !quote.isAllowed) {
    return `크레딧이 ${quote.shortfallCredits} 부족합니다. 충전 후 최신 견적을 다시 확인해 주세요.`;
  }
  if (code === "QUOTE_EXPIRED") {
    return "견적 유효 시간이 지나 최신 견적을 불러왔습니다. 잔액과 비용을 확인한 뒤 다시 접수해 주세요.";
  }
  if (code === "QUOTE_CHANGED") {
    return "잔액 또는 비용이 변경되어 최신 견적을 불러왔습니다. 내용을 확인한 뒤 다시 접수해 주세요.";
  }
  return "최신 크레딧 견적을 불러왔습니다. 잔액과 차감 후 잔액을 확인한 뒤 다시 접수해 주세요.";
}

interface AcceptedGenerationGuideState {
  generationId: string;
  acceptedAt: string;
  creditReceipt: GenerationCreditReceipt | null;
}

export default function GenerateScreen() {
  const router = useRouter();
  const api = useHairfitApi();
  const flow = useGenerationFlow();
  const [isAccepting, setIsAccepting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const [quote, setQuote] = useState<PaidActionQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [acceptedGeneration, setAcceptedGeneration] = useState<AcceptedGenerationGuideState | null>(null);
  const quoteRequestIdRef = useRef(0);
  const draftId = flow.draftReceipt?.draftId ?? null;
  const quoteExpired = useNativePaidActionQuoteExpired(quote);

  const showMessage = useCallback((text: string, isError = false) => {
    setMessage(text);
    setMessageIsError(isError);
  }, []);
  const explainBlockedBack = useCallback(() => {
    showMessage("생성 접수 영수증을 확인하고 있습니다. 접수 완료 안내가 표시된 뒤 이동해 주세요.");
  }, [showMessage]);
  const navigateBack = useSafeBackNavigation({
    blocked: isAccepting,
    fallback: acceptedGeneration ? "/mypage" : "/upload",
    mode: acceptedGeneration ? "replace" : "history",
    onBlocked: explainBlockedBack,
  });

  const refreshQuote = useCallback(async () => {
    if (!draftId) {
      setQuote(null);
      setQuoteError("사진 보안 업로드가 끝난 뒤 크레딧 견적을 확인할 수 있습니다.");
      return null;
    }

    const requestId = ++quoteRequestIdRef.current;
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const response = await api.createPaidActionQuote({
        action: "hair_generation",
        subjectId: draftId,
        billingScope: "customer",
      });
      const normalized = normalizePaidActionQuote(response.quote);
      if (
        !normalized ||
        normalized.action !== "hair_generation" ||
        normalized.billingScope !== "customer" ||
        normalized.subjectId !== draftId
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
  }, [api, draftId]);

  useEffect(() => {
    quoteRequestIdRef.current += 1;
    setQuote(null);
    setQuoteError(null);
    setQuoteLoading(false);
    if (!flow.draftReceiptHydrated || !draftId) return;
    void refreshQuote();
    return () => {
      quoteRequestIdRef.current += 1;
    };
  }, [draftId, flow.draftReceiptHydrated, refreshQuote]);

  const acceptGeneration = async () => {
    const receipt = flow.draftReceipt;
    if (!receipt || isAccepting || quoteLoading) return;

    if (
      !quote ||
      quote.subjectId !== receipt.draftId ||
      isPaidActionQuoteExpired(quote)
    ) {
      const wasExpired = Boolean(quote && isPaidActionQuoteExpired(quote));
      const refreshedQuote = await refreshQuote();
      if (refreshedQuote) {
        showMessage(
          wasExpired
            ? "견적이 만료되어 최신 견적을 불러왔습니다. 내용을 확인한 뒤 생성 접수 버튼을 다시 눌러 주세요."
            : "최신 크레딧 견적을 준비했습니다. 내용을 확인한 뒤 생성 접수 버튼을 다시 눌러 주세요.",
        );
      }
      return;
    }

    if (!quote.isAllowed) {
      showMessage(
        `크레딧이 ${quote.shortfallCredits} 부족합니다. 크레딧을 충전한 뒤 최신 견적을 다시 확인해 주세요.`,
        true,
      );
      return;
    }

    setIsAccepting(true);
    showMessage("생성 작업을 안전하게 접수하고 있습니다. 접수 영수증이 표시될 때까지 앱을 유지해 주세요.");
    try {
      const accepted = await api.acceptGenerationDraft(receipt.draftId, quote.quoteId);
      if (!accepted.generationId || !accepted.acceptedAt) {
        throw new Error("생성 접수 영수증이 완전하지 않습니다.");
      }
      const creditReceipt = accepted.creditReceipt == null
        ? null
        : normalizeGenerationCreditReceipt(accepted.creditReceipt);
      if (accepted.billingMode === "reserved_v1" && !creditReceipt) {
        throw new Error("크레딧 예약 영수증을 확인하지 못했습니다.");
      }

      setAcceptedGeneration({
        generationId: accepted.generationId,
        acceptedAt: accepted.acceptedAt,
        creditReceipt,
      });

      // The server transaction now owns the original portrait and Workflow
      // outbox. Remove the in-memory base64 while keeping the accepted guide on this screen.
      flow.clear();
      setMessage(null);
      setMessageIsError(false);
    } catch (error) {
      if (error instanceof HairfitApiError) {
        const quoteCode = readQuoteErrorCode(error.payload);
        const freshQuote = readFreshGenerationQuote(error.payload, receipt.draftId);
        if (freshQuote) {
          quoteRequestIdRef.current += 1;
          setQuoteLoading(false);
          setQuoteError(null);
          setQuote(freshQuote);
          showMessage(quoteRefreshMessage(quoteCode, freshQuote), quoteCode === "INSUFFICIENT_CREDITS");
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
        const redirectTo = readRedirectTo(error.payload);
        if (redirectTo) {
          router.push(redirectTo);
          return;
        }
      }
      showMessage("생성 작업을 접수하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.", true);
    } finally {
      setIsAccepting(false);
    }
  };

  if (acceptedGeneration) {
    const acceptedProgress = getGenerationJobProgressPresentation({
      status: "queued",
      acceptedAt: acceptedGeneration.acceptedAt,
      totalVariantCount: 9,
      completedVariantCount: 0,
      failedVariantCount: 0,
    });

    return (
      <AppScreen>
        <Panel>
          <Stack>
            <Kicker>생성 접수 완료</Kicker>
            <Heading>백그라운드 생성이 시작되었습니다</Heading>
            <BodyText>
              접수 영수증을 확인했습니다. 이제 다른 화면으로 이동하거나 앱을 종료해도 서버에서 헤어스타일 생성을 계속합니다.
            </BodyText>
          </Stack>
        </Panel>

        <GenerationJobProgressCard presentation={acceptedProgress} />

        <Card>
          <Stack gap={8}>
            <Kicker>완료 알림</Kicker>
            <Heading>생성이 끝나면 알려드릴게요</Heading>
            <BodyText>
              가입 이메일로 완료 안내를 보내드립니다. 진행 상태는 마이페이지의 작업 현황에서도 다시 확인할 수 있습니다.
            </BodyText>
            {acceptedGeneration.creditReceipt ? (
              <BodyText>
                {acceptedGeneration.creditReceipt.reservedCredits}크레딧 예약도 함께 완료되었습니다.
              </BodyText>
            ) : null}
          </Stack>
        </Card>

        <Button onPress={() => router.push(`/generate/${acceptedGeneration.generationId}`)}>
          작업 현황 보기
        </Button>
        <Button variant="secondary" onPress={() => router.replace("/")}>
          홈으로 이동
        </Button>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <Stack>
        <Kicker>헤어 생성</Kicker>
        <Heading>나에게 맞춘 헤어스타일 결과</Heading>
        <BodyText>사진 보안 업로드는 완료되었습니다. 이제 3x3 헤어스타일 생성 작업을 접수합니다.</BodyText>
        <BodyText>“백그라운드 생성 시작” 안내가 표시될 때까지 이 화면을 유지해 주세요.</BodyText>
      </Stack>

      <Panel>
        <Stack>
          <PaidActionQuoteCard
            error={quoteError}
            loading={quoteLoading}
            onOpenBilling={() => router.push("/billing?returnTo=%2Fgenerate")}
            onRefresh={() => void refreshQuote()}
            payerLabel="내 HairFit 계정"
            quote={quote}
          />
          {!flow.draftReceiptHydrated ? (
            <Card>
              <BodyText>저장된 사진 업로드 영수증을 확인하고 있습니다.</BodyText>
            </Card>
          ) : !flow.draftReceipt ? (
            <Card>
              <Stack>
                <Kicker>사진 업로드 필요</Kicker>
                <Heading>사진 보안 업로드가 필요합니다</Heading>
                <BodyText>사진을 선택하고 업로드 완료 영수증을 받은 뒤 생성을 시작해 주세요.</BodyText>
                <Button onPress={() => router.replace("/upload")}>사진 선택</Button>
              </Stack>
            </Card>
          ) : (
            <Card>
              <Stack gap={10}>
                <Kicker>접수 준비 완료</Kicker>
                <Heading>사진이 안전하게 저장되었습니다</Heading>
                <BodyText>접수 버튼을 누른 뒤 완료 응답 전까지만 앱을 유지해 주세요. 응답을 잃어도 같은 영수증으로 중복 없이 다시 시도할 수 있습니다.</BodyText>
              </Stack>
            </Card>
          )}

          <Button
            accessibilityState={{ busy: isAccepting || quoteLoading }}
            disabled={
              !flow.draftReceiptHydrated ||
              !flow.draftReceipt ||
              isAccepting ||
              quoteLoading ||
              Boolean(quote && !quoteExpired && !quote.isAllowed)
            }
            onPress={acceptGeneration}
          >
            {isAccepting
              ? "생성 접수 중 · 아직 종료하지 마세요"
              : quoteLoading
                ? "최신 견적 확인 중"
                : !quote || quote.subjectId !== draftId || quoteExpired
                  ? "최신 크레딧 견적 확인"
                  : !quote.isAllowed
                    ? "크레딧 부족 · 충전 필요"
                    : quote.isFree
                      ? "생성 접수 · 추가 차감 없음"
                      : `생성 접수 · ${quote.costCredits}크레딧 사용 예정`}
          </Button>

          {message ? (
            <View
              accessibilityLiveRegion={messageIsError ? "assertive" : "polite"}
              accessibilityRole={messageIsError ? "alert" : undefined}
            >
              <BodyText>{message}</BodyText>
            </View>
          ) : null}
          <Button disabled={isAccepting} variant="secondary" onPress={navigateBack}>
            이전 화면으로
          </Button>
        </Stack>
      </Panel>
    </AppScreen>
  );
}
