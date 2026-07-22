import { useAuth } from "@clerk/clerk-expo";
import type {
  MobileGooglePlayCatalogProduct,
  MobileGooglePlayCatalogResponse,
} from "@hairfit/shared";
import { BodyText, Button, Card, Heading, Kicker, Panel, Stack } from "@hairfit/ui-native";
import { type ProductSubscription, type Purchase, useIAP } from "expo-iap";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, View } from "react-native";
import { AppScreen } from "../app/AppScreen";
import { useSafeBackNavigation } from "../../hooks/useSafeBackNavigation";
import { useHairfitApi } from "../../lib/api";
import { normalizePaymentResumeReturnTo } from "../../lib/payment-resume";

const PLAY_SUBSCRIPTIONS_URL =
  "https://play.google.com/store/account/subscriptions?package=com.hairfit.app";

function eligibilityMessage(product: MobileGooglePlayCatalogProduct) {
  switch (product.eligibilityReason) {
    case "subscription_required":
      return "활성 유료 구독자만 추가 이용권을 구매할 수 있습니다.";
    case "active_subscription":
      return "첫 버전에서는 Play 구독 간 플랜 변경을 지원하지 않습니다.";
    case "portone_recurring":
      return "웹 자동결제를 해지하고 이용 기간이 끝난 뒤 Play 구독을 시작할 수 있습니다.";
    default:
      return null;
  }
}

export function GooglePlayBillingScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useHairfitApi();
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const paymentReturnTo = useMemo(() => normalizePaymentResumeReturnTo(returnTo), [returnTo]);
  const [catalog, setCatalog] = useState<MobileGooglePlayCatalogResponse | null>(null);
  const [catalogPending, setCatalogPending] = useState(true);
  const [purchasePending, setPurchasePending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const processingTokensRef = useRef(new Set<string>());
  const handledTokensRef = useRef(new Set<string>());
  const purchaseHandlerRef = useRef<(purchase: Purchase) => Promise<void>>(async () => undefined);

  const showMessage = useCallback((text: string, isError = false) => {
    setMessage(text);
    setMessageIsError(isError);
  }, []);

  const {
    availablePurchases,
    connected,
    fetchProducts,
    finishTransaction,
    getAvailablePurchases,
    products,
    requestPurchase,
    subscriptions,
  } = useIAP({
    onPurchaseSuccess: (purchase) => {
      void purchaseHandlerRef.current(purchase);
    },
    onPurchaseError: (error) => {
      setPurchasePending(false);
      if (error.code === "user-cancelled") {
        showMessage("결제가 취소되었습니다. 상품을 다시 선택하면 언제든 이어서 진행할 수 있습니다.");
        return;
      }
      showMessage("Google Play 결제를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.", true);
    },
    onError: () => {
      showMessage("Google Play 상품 또는 구매 내역을 불러오지 못했습니다.", true);
    },
  });

  const refreshCatalog = useCallback(async () => {
    setCatalogPending(true);
    try {
      const nextCatalog = await api.getGooglePlayCatalog();
      setCatalog(nextCatalog);
      if (!nextCatalog.enabled) {
        showMessage("Google Play 결제 준비가 아직 완료되지 않았습니다.", true);
      }
    } catch {
      setCatalog(null);
      showMessage("결제 가능 상품을 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.", true);
    } finally {
      setCatalogPending(false);
    }
  }, [api, showMessage]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      if (isLoaded) setCatalogPending(false);
      return;
    }
    void refreshCatalog();
  }, [isLoaded, isSignedIn, refreshCatalog]);

  useEffect(() => {
    if (!connected || !catalog?.enabled) return;
    const subscriptionIds = catalog.products
      .filter((product) => product.productType === "subscription")
      .map((product) => product.productId);
    const consumableIds = catalog.products
      .filter((product) => product.productType === "consumable")
      .map((product) => product.productId);

    void Promise.all([
      fetchProducts({ skus: subscriptionIds, type: "subs" }),
      fetchProducts({ skus: consumableIds, type: "in-app" }),
      getAvailablePurchases(),
    ]).catch(() => {
      showMessage("Google Play 상품 정보를 새로고침하지 못했습니다.", true);
    });
  }, [catalog, connected, fetchProducts, getAvailablePurchases, showMessage]);

  const storePriceByProductId = useMemo(() => {
    const entries = [...products, ...subscriptions].map((product) => [
      product.id,
      product.displayPrice,
    ] as const);
    return new Map(entries);
  }, [products, subscriptions]);

  const processPurchase = useCallback(async (purchase: Purchase) => {
    const purchaseToken = purchase.purchaseToken;
    if (!purchaseToken || handledTokensRef.current.has(purchaseToken)) return;
    if (processingTokensRef.current.has(purchaseToken)) return;

    processingTokensRef.current.add(purchaseToken);
    setPurchasePending(true);
    try {
      if (purchase.purchaseState === "pending") {
        showMessage("결제가 보류 중입니다. Google Play에서 승인되면 자동으로 다시 확인합니다.");
        return;
      }
      if (purchase.purchaseState !== "purchased") {
        showMessage("Google Play 구매 상태를 아직 확인할 수 없습니다.", true);
        return;
      }

      const result = await api.verifyGooglePlayPurchase({
        productId: purchase.productId,
        purchaseToken,
      });
      if (result.state === "pending") {
        showMessage("결제가 보류 중입니다. 승인 전에는 크레딧이 지급되지 않습니다.");
        return;
      }

      if (result.shouldFinishTransaction) {
        await finishTransaction({
          purchase,
          isConsumable: result.productType === "consumable",
        });
      }
      handledTokensRef.current.add(purchaseToken);
      showMessage(
        result.creditsGranted > 0
          ? `${result.creditsGranted.toLocaleString("ko-KR")}크레딧이 지급되었습니다.`
          : "이미 확인된 구매입니다. 현재 잔액에 한 번만 반영되었습니다.",
      );
      await refreshCatalog();
    } catch {
      showMessage(
        "구매는 보존되어 있습니다. 서버 확인이 끝나지 않아 크레딧을 지급하지 않았으며, 다시 열면 자동 복원합니다.",
        true,
      );
    } finally {
      processingTokensRef.current.delete(purchaseToken);
      setPurchasePending(false);
    }
  }, [api, finishTransaction, refreshCatalog, showMessage]);

  purchaseHandlerRef.current = processPurchase;

  useEffect(() => {
    for (const purchase of availablePurchases) {
      void processPurchase(purchase);
    }
  }, [availablePurchases, processPurchase]);

  const startPurchase = useCallback(async (product: MobileGooglePlayCatalogProduct) => {
    if (!product.eligible || purchasePending) return;
    setPurchasePending(true);
    showMessage("서버에서 안전한 구매 정보를 준비하고 있습니다.");
    try {
      const intent = await api.createGooglePlayPurchaseIntent({ productKey: product.key });
      if (product.productType === "subscription") {
        const storeSubscription = subscriptions.find(
          (candidate): candidate is ProductSubscription => candidate.id === product.productId,
        );
        const offer = storeSubscription?.subscriptionOffers?.find(
          (candidate) => candidate.basePlanIdAndroid === product.basePlanId && candidate.offerTokenAndroid,
        );
        if (!offer?.offerTokenAndroid) {
          throw new Error("Required Google Play base plan offer is unavailable");
        }
        await requestPurchase({
          type: "subs",
          request: {
            google: {
              skus: [product.productId],
              subscriptionOffers: [{ sku: product.productId, offerToken: offer.offerTokenAndroid }],
              obfuscatedAccountId: intent.obfuscatedAccountId,
              obfuscatedProfileId: intent.obfuscatedProfileId,
            },
          },
        });
      } else {
        if (!products.some((candidate) => candidate.id === product.productId)) {
          throw new Error("Google Play product is unavailable");
        }
        await requestPurchase({
          type: "in-app",
          request: {
            google: {
              skus: [product.productId],
              obfuscatedAccountId: intent.obfuscatedAccountId,
              obfuscatedProfileId: intent.obfuscatedProfileId,
            },
          },
        });
      }
    } catch (error) {
      setPurchasePending(false);
      if (error instanceof Error && "code" in error && error.code === "user-cancelled") {
        showMessage("결제가 취소되었습니다.");
        return;
      }
      showMessage("구매를 시작하지 못했습니다. Play 상품 설정과 네트워크를 확인해 주세요.", true);
    }
  }, [api, products, purchasePending, requestPurchase, showMessage, subscriptions]);

  const navigateBack = useSafeBackNavigation({
    blocked: purchasePending,
    fallback: paymentReturnTo as Href,
    mode: "replace",
    onBlocked: () => showMessage("결제 상태 확인이 끝난 뒤 이동해 주세요."),
  });

  const subscriptionProducts = catalog?.products.filter(
    (product) => product.productType === "subscription",
  ) ?? [];
  const consumableProducts = catalog?.products.filter(
    (product) => product.productType === "consumable",
  ) ?? [];

  const renderProduct = (product: MobileGooglePlayCatalogProduct) => {
    const blockedReason = eligibilityMessage(product);
    const storePrice = storePriceByProductId.get(product.productId);
    return (
      <Card key={product.key}>
        <Stack gap={10}>
          <Heading>{product.label}</Heading>
          <BodyText>
            {storePrice ?? "Google Play 가격 확인 중"} · {product.credits.toLocaleString("ko-KR")}크레딧
          </BodyText>
          {blockedReason ? <BodyText>{blockedReason}</BodyText> : null}
          <Button
            disabled={!catalog?.enabled || !connected || !product.eligible || purchasePending || !storePrice}
            onPress={() => void startPurchase(product)}
          >
            {purchasePending ? "결제 확인 중..." : "Google Play에서 구매"}
          </Button>
        </Stack>
      </Card>
    );
  };

  return (
    <AppScreen>
      <Stack>
        <Kicker>Google Play 결제</Kicker>
        <Heading>구독과 추가 이용권</Heading>
        <BodyText>
          앱에는 Google Play가 반환한 실제 현지화 가격을 표시하며, 서버 검증이 끝난 구매만 지급합니다.
        </BodyText>
      </Stack>

      <Panel>
        <Stack gap={10}>
          <Heading>월 정기구독</Heading>
          {catalogPending ? <BodyText>Play 상품을 불러오는 중입니다.</BodyText> : null}
          {subscriptionProducts.map(renderProduct)}
          {catalog?.canTransitionLegacyMobile ? (
            <BodyText>기존 모바일 1개월권의 남은 크레딧을 보존하고 Play 구독을 시작할 수 있습니다.</BodyText>
          ) : null}
        </Stack>
      </Panel>

      <Panel>
        <Stack gap={10}>
          <Heading>구독자 전용 추가 이용권</Heading>
          <BodyText>활성 유료 구독자만 구매할 수 있는 소모성 상품입니다.</BodyText>
          {consumableProducts.map(renderProduct)}
        </Stack>
      </Panel>

      <Panel>
        <Stack gap={10}>
          {message ? (
            <View
              accessibilityLiveRegion={messageIsError ? "assertive" : "polite"}
              accessibilityRole={messageIsError ? "alert" : undefined}
            >
              <BodyText>{message}</BodyText>
            </View>
          ) : null}
          <Button
            disabled={purchasePending || !connected}
            variant="secondary"
            onPress={() => void getAvailablePurchases()}
          >
            구매 내역 복원
          </Button>
          <Button variant="secondary" onPress={() => void Linking.openURL(PLAY_SUBSCRIPTIONS_URL)}>
            Google Play 구독 관리
          </Button>
          <Button variant="secondary" onPress={() => router.push("/legal/terms")}>이용 약관 보기</Button>
          <Button variant="secondary" onPress={() => router.push("/legal/privacy")}>개인정보 처리방침 보기</Button>
          <Button disabled={purchasePending} variant="secondary" onPress={navigateBack}>이전 화면으로</Button>
        </Stack>
      </Panel>
    </AppScreen>
  );
}
