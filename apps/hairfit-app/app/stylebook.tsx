import { useAuth } from "@clerk/clerk-expo";
import type {
  CustomerStylebookCollectionMutationV2,
  CustomerStylebookItemRefV2,
  CustomerStylebookItemStatePatchV2,
  CustomerStylebookShareRequestV2,
  CustomerStylebookV2,
  CustomerStylebookViewV2,
  CustomerStylebookWearLogRequestV2,
} from "@hairfit/shared";
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
import { getHairfitApiBaseUrl, useHairfitApi } from "../lib/api";
import { mapMobileUserError } from "../lib/mobile-user-message";

export default function StylebookScreen() {
  const api = useHairfitApi();
  const router = useRouter();
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [collection, setCollection] = useState<CustomerStylebookV2 | null>(null);
  const [activeView, setActiveView] = useState<CustomerStylebookViewV2>("hair");
  const [message, setMessage] = useState("스타일북을 불러오는 중입니다.");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

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

  const mutate = useCallback(async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      await load();
      setMessage(success);
    } catch (error) {
      setMessage(mapMobileUserError(error, "스타일북 변경을 저장하지 못했습니다. 다시 시도해 주세요."));
    } finally {
      setBusy(false);
    }
  }, [load]);

  const updateItemState = useCallback((input: CustomerStylebookItemStatePatchV2) =>
    mutate(() => api.updateCustomerStylebookItemStateV2(input), "스타일북 정보를 저장했습니다."), [api, mutate]);

  const mutateCollection = useCallback((input: CustomerStylebookCollectionMutationV2) =>
    mutate(() => api.mutateCustomerStylebookCollectionV2(input), "컬렉션을 업데이트했습니다."), [api, mutate]);

  const createWearLog = useCallback((input: CustomerStylebookWearLogRequestV2, photo: { uri: string; name: string; type: string } | null, photoConsent: boolean) =>
    mutate(() => api.createCustomerStylebookWearLogV2(input, photo, photoConsent), "실제 시술·착장 기록을 저장했습니다."), [api, mutate]);

  const deleteWearLog = useCallback((id: string) =>
    mutate(() => api.deleteCustomerStylebookWearLogV2(id), "실제 기록을 삭제했습니다."), [api, mutate]);

  const createShare = useCallback(async (input: CustomerStylebookShareRequestV2) => {
    setBusy(true);
    try {
      const result = await api.createCustomerStylebookShareV2(input);
      await load();
      setMessage(`${new Date(result.expiresAt).toLocaleString("ko-KR")}까지 유효한 공유 링크를 만들었습니다.`);
      return `${getHairfitApiBaseUrl()}/stylebook/share/${encodeURIComponent(result.token)}`;
    } catch (error) {
      setMessage(mapMobileUserError(error, "공유 링크를 만들지 못했습니다."));
      return "";
    } finally {
      setBusy(false);
    }
  }, [api, load]);

  const revokeShare = useCallback((id: string) =>
    mutate(() => api.revokeCustomerStylebookShareV2(id), "공유 링크를 취소했습니다."), [api, mutate]);

  const startFromReference = useCallback(async (item: CustomerStylebookItemRefV2) => {
    setBusy(true);
    try {
      const result = await api.createCustomerStylebookReferencedConsultationV2(item);
      setMessage("선택한 스타일을 참고 정보로 연결했습니다. 기존 컨설팅 흐름은 그대로 시작합니다.");
      router.push(`/consulting?consultationId=${encodeURIComponent(result.snapshot.sessionId)}` as Href);
    } catch (error) {
      setMessage(mapMobileUserError(error, "참고 스타일을 연결한 새 컨설팅을 시작하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }, [api, router]);

  return (
    <CustomerScreen>
      <View style={styles.header}>
        <CustomerKicker>Stylebook</CustomerKicker>
        <CustomerHeading>나의 스타일북</CustomerHeading>
        <CustomerBody>최종 헤어·패션을 검색하고 비교해 컬렉션과 토털 세트로 정리하고, 실제 사용 기록까지 이어가세요.</CustomerBody>
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
          busy={busy}
          onViewChange={setActiveView}
          onOpenConsultation={(consultationId) => router.push(
            `/consulting?consultationId=${encodeURIComponent(consultationId)}` as Href,
          )}
          onStartConsultation={() => router.push("/consulting")}
          onUpdateItemState={updateItemState}
          onMutateCollection={mutateCollection}
          onCreateWearLog={createWearLog}
          onDeleteWearLog={deleteWearLog}
          onCreateShare={createShare}
          onRevokeShare={revokeShare}
          onStartFromReference={startFromReference}
        />
      ) : null}
    </CustomerScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 10, paddingHorizontal: 4, paddingVertical: 8 },
  messageCard: { gap: 12 },
});
