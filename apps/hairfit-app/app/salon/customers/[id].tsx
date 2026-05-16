import { useAuth } from "@clerk/clerk-expo";
import type { SalonCustomerDetailResponse } from "@hairfit/api-client";
import { BodyText, Button, Card, Chip, Cluster, Heading, Kicker, Panel, Screen, Stack } from "@hairfit/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useHairfitApi } from "../../../lib/api";

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
          setError(loadError instanceof Error ? loadError.message : "고객 상세를 불러오지 못했습니다.");
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
  }, [api, customerId, isLoaded, isSignedIn]);

  const customer = detail?.customer;

  return (
    <Screen>
      <Panel>
        <Stack>
          <Kicker>Salon CRM</Kicker>
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
        <Card>
          <BodyText>{error}</BodyText>
        </Card>
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
    </Screen>
  );
}
