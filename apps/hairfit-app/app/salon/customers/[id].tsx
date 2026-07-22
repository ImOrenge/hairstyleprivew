import { useAuth } from "@clerk/clerk-expo";
import type { SalonCustomerDetailResponse } from "@hairfit/api-client";
import { BodyText, Button, Card, Chip, Cluster, Heading, Kicker, Panel, Stack } from "@hairfit/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { AppScreen } from "../../../components/app/AppScreen";
import { useHairfitApi } from "../../../lib/api";
import { mapMobileUserError } from "../../../lib/mobile-user-message";

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function SalonCustomerDetailScreen() {
  const api = useHairfitApi();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const customerId = typeof id === "string" ? id : "";
  const { isLoaded, isSignedIn } = useAuth();
  const [detail, setDetail] = useState<SalonCustomerDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disconnectPending, setDisconnectPending] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isLoaded || !customerId) return;
      if (!isSignedIn) {
        setError("살롱 오너 계정으로 로그인해야 고객 상세를 볼 수 있습니다.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const result = await api.getSalonCustomer(customerId);
        if (!cancelled) {
          setDetail(result);
        }
      } catch (loadError) {
        if (!cancelled) {
          setDetail(null);
          setError(mapMobileUserError(loadError, "고객 상세를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, customerId, isLoaded, isSignedIn, reloadKey]);

  const disconnectMember = async () => {
    if (!detail?.connection || disconnectPending) return;
    setDisconnectPending(true);
    setError(null);
    try {
      await api.revokeSalonConnection(detail.connection.id, "salon_requested");
      setReloadKey((current) => current + 1);
    } catch (disconnectError) {
      setError(mapMobileUserError(disconnectError, "회원 연결을 해제하지 못했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      setDisconnectPending(false);
    }
  };

  const confirmDisconnect = () => {
    Alert.alert(
      "회원 연결을 해제할까요?",
      "해제 즉시 회원 프로필과 HairFit 생성·확정 기록을 볼 수 없습니다. 살롱 작성 방문·상담 기록은 일반 고객 기록으로 유지됩니다.",
      [
        { text: "취소", style: "cancel" },
        { text: "연결 해제", style: "destructive", onPress: () => void disconnectMember() },
      ],
    );
  };

  const customer = detail?.customer;

  return (
    <AppScreen>
      <Panel>
        <Stack>
          <Kicker>살롱 고객 관리</Kicker>
          <Heading>{customer?.name || "고객 상세"}</Heading>
          <BodyText>{customer?.phone || customer?.email || customerId}</BodyText>
          <Cluster>
            {customer ? <Chip tone={customer.isLinkedMember ? "success" : "neutral"}>{customer.isLinkedMember ? "회원 연결" : "수기 등록"}</Chip> : null}
            {customer?.styleTarget ? <Chip>{customer.styleTarget === "male" ? "남성" : "여성"}</Chip> : null}
            {customer?.nextFollowUpAt ? <Chip>다음 케어 {formatDate(customer.nextFollowUpAt)}</Chip> : null}
          </Cluster>
          <Button variant="secondary" onPress={() => router.push("/salon/customers")}>
            고객 목록
          </Button>
        </Stack>
      </Panel>

      {isLoading ? (
        <Card>
          <BodyText>고객 상세를 불러오는 중입니다.</BodyText>
        </Card>
      ) : null}

      {error ? (
        <View accessibilityLiveRegion="assertive" accessibilityRole="alert">
          <Card>
            <BodyText>{error}</BodyText>
          </Card>
        </View>
      ) : null}

      {detail ? (
        <>
          <Panel>
            <Stack>
              <Heading style={{ fontSize: 20, lineHeight: 26 }}>고객 메모</Heading>
              <BodyText>{detail.customer.memo || "메모가 없습니다."}</BodyText>
              <BodyText>SMS 동의: {detail.customer.consentSms ? "예" : "아니오"} · 카카오 동의: {detail.customer.consentKakao ? "예" : "아니오"}</BodyText>
            </Stack>
          </Panel>

          <Panel>
            <Stack>
              <Heading style={{ fontSize: 20, lineHeight: 26 }}>연결 회원</Heading>
              {detail.linkedMember ? (
                <Card>
                  <Stack gap={8}>
                    <BodyText style={{ color: "#f4f1e8", fontWeight: "800" }}>{detail.linkedMember.displayName}</BodyText>
                    <BodyText>{detail.linkedMember.email}</BodyText>
                  </Stack>
                </Card>
              ) : (
                <BodyText>연결된 회원이 없습니다.</BodyText>
              )}
              {detail.connection ? (
                <Button variant="secondary" disabled={disconnectPending} onPress={confirmDisconnect}>
                  {disconnectPending ? "연결 해제 중..." : "회원 연결 해제"}
                </Button>
              ) : null}
              {detail.linkedMemberGenerations.map((generation) => (
                <Card key={generation.id}>
                  <Stack gap={8}>
                    <Cluster>
                      <Chip>{generation.status}</Chip>
                      <Chip>{formatDate(generation.createdAt)}</Chip>
                    </Cluster>
                    <BodyText>{generation.styleLabel || generation.promptUsed || generation.id}</BodyText>
                  </Stack>
                </Card>
              ))}
              {detail.linkedMemberHairRecords.map((record) => (
                <Card key={record.id}>
                  <Stack gap={8}>
                    <Chip tone="success">확정 헤어</Chip>
                    <BodyText>{record.styleName}</BodyText>
                    <BodyText>{record.serviceType} · {record.serviceDate}</BodyText>
                  </Stack>
                </Card>
              ))}
            </Stack>
          </Panel>

          <Panel>
            <Stack>
              <Heading style={{ fontSize: 20, lineHeight: 26 }}>방문 기록</Heading>
              {detail.visits.length === 0 ? <BodyText>방문 기록이 없습니다.</BodyText> : null}
              {detail.visits.map((visit) => (
                <Card key={visit.id}>
                  <Stack gap={8}>
                    <Cluster>
                      <Chip>{visit.serviceType || "서비스"}</Chip>
                      <Chip>{formatDate(visit.visitedAt)}</Chip>
                    </Cluster>
                    <BodyText>{visit.styleLabel || visit.serviceNote || "방문 기록"}</BodyText>
                    {visit.nextRecommendedVisitAt ? <BodyText>권장 재방문 {formatDate(visit.nextRecommendedVisitAt)}</BodyText> : null}
                  </Stack>
                </Card>
              ))}
            </Stack>
          </Panel>

          <Panel>
            <Stack>
              <Heading style={{ fontSize: 20, lineHeight: 26 }}>애프터케어</Heading>
              {detail.aftercareTasks.length === 0 ? <BodyText>애프터케어 작업이 없습니다.</BodyText> : null}
              {detail.aftercareTasks.map((task) => (
                <Card key={task.id}>
                  <Stack gap={8}>
                    <Cluster>
                      <Chip tone={task.status === "pending" ? "accent" : "neutral"}>{task.status}</Chip>
                      <Chip>{task.channel}</Chip>
                      <Chip>{formatDate(task.scheduledFor)}</Chip>
                    </Cluster>
                    <BodyText>{task.note || "메모 없음"}</BodyText>
                  </Stack>
                </Card>
              ))}
            </Stack>
          </Panel>
        </>
      ) : null}
    </AppScreen>
  );
}
