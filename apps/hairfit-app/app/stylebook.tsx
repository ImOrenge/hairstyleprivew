import { useAuth } from "@clerk/clerk-expo";
import type { CustomerStylebookV2, CustomerStylebookViewV2 } from "@hairfit/shared";
import { type Href, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  CustomerBody,
  CustomerButton,
  CustomerCard,
  CustomerHeading,
  CustomerKicker,
  CustomerScreen,
} from "../components/customer/CustomerPrimitives";
import { NativeStylebookCollection } from "../components/customer/NativeStylebookCollection";
import { useHairfitApi } from "../lib/api";
import { mapMobileUserError } from "../lib/mobile-user-message";

export default function StylebookScreen() {
  const api = useHairfitApi();
  const router = useRouter();
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [collection, setCollection] = useState<CustomerStylebookV2 | null>(null);
  const [activeView, setActiveView] = useState<CustomerStylebookViewV2>("hair");
  const [message, setMessage] = useState("스타일북을 불러오는 중입니다.");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setLoading(false);
      setMessage("로그인하면 확정한 헤어와 패션 룩을 한곳에서 확인할 수 있어요.");
      return;
    }

    setLoading(true);
    setMessage("스타일북을 불러오는 중입니다.");
    try {
      const result = await api.getCustomerStylebookV2();
      setCollection(result);
      setMessage("");
    } catch (error) {
      setCollection(null);
      setMessage(mapMobileUserError(error, "스타일북을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      setLoading(false);
    }
  }, [api, isLoaded, isSignedIn]);

  useEffect(() => {
    void load();
  }, [load, userId]);

  return (
    <CustomerScreen>
      <View style={styles.header}>
        <CustomerKicker>Stylebook</CustomerKicker>
        <CustomerHeading>나의 스타일북</CustomerHeading>
        <CustomerBody>컨설팅에서 최종 확정한 헤어와 패션 룩을 모아, 완성된 리포트로 다시 확인하세요.</CustomerBody>
        <CustomerButton onPress={() => router.push("/consulting")}>새 컨설팅</CustomerButton>
      </View>

      {message ? (
        <CustomerCard style={styles.messageCard}>
          <CustomerBody>{message}</CustomerBody>
          {!isSignedIn && isLoaded ? (
            <CustomerButton secondary onPress={() => router.push("/login")}>로그인</CustomerButton>
          ) : null}
          {!loading && isSignedIn ? (
            <CustomerButton secondary onPress={() => void load()}>다시 시도</CustomerButton>
          ) : null}
        </CustomerCard>
      ) : null}

      {collection ? (
        <NativeStylebookCollection
          collection={collection}
          activeView={activeView}
          onViewChange={setActiveView}
          onOpenConsultation={(consultationId) => router.push(
            `/consulting?consultationId=${encodeURIComponent(consultationId)}` as Href,
          )}
          onStartConsultation={() => router.push("/consulting")}
        />
      ) : null}
    </CustomerScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 10, paddingHorizontal: 4, paddingVertical: 8 },
  messageCard: { gap: 12 },
});
