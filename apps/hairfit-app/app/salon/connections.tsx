import { useAuth } from "@clerk/clerk-expo";
import type { SalonMemberConnection } from "@hairfit/api-client";
import { BodyText, Button, Card, Chip, Cluster, Heading, Kicker, Panel, Stack } from "@hairfit/ui-native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { AppScreen } from "../../components/app/AppScreen";
import { useHairfitApi } from "../../lib/api";
import { mapMobileUserError } from "../../lib/mobile-user-message";

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function SalonConnectionsScreen() {
  const api = useHairfitApi();
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [connections, setConnections] = useState<SalonMemberConnection[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!isLoaded) return;
      if (!isSignedIn) {
        setMessage("로그인하면 살롱 연결을 확인하고 해제할 수 있습니다.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setMessage(null);
      try {
        const result = await api.listSalonConnections();
        if (!cancelled) setConnections(result.connections);
      } catch (error) {
        if (!cancelled) setMessage(mapMobileUserError(error, "살롱 연결을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, isLoaded, isSignedIn]);

  const revoke = async (connection: SalonMemberConnection) => {
    if (pendingId) return;
    setPendingId(connection.id);
    setMessage(null);
    try {
      await api.revokeSalonConnection(connection.id, "member_requested");
      setConnections((current) => current.filter((item) => item.id !== connection.id));
      setMessage("살롱 연결을 해제했습니다. HairFit의 일반 기능은 계속 사용할 수 있습니다.");
    } catch (error) {
      setMessage(mapMobileUserError(error, "살롱 연결을 해제하지 못했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      setPendingId(null);
    }
  };

  const confirmRevoke = (connection: SalonMemberConnection) => {
    Alert.alert(
      "살롱 연결을 해제할까요?",
      "해제 즉시 살롱은 회원 프로필과 HairFit 생성·확정 기록을 볼 수 없습니다. 살롱 작성 기록은 일반 고객 기록으로 유지됩니다.",
      [
        { text: "취소", style: "cancel" },
        { text: "연결 해제", style: "destructive", onPress: () => void revoke(connection) },
      ],
    );
  };

  return (
    <AppScreen>
      <Panel>
        <Stack>
          <Kicker>개인정보 및 동의</Kicker>
          <Heading>살롱 연결 관리</Heading>
          <BodyText>연결 상태와 동의 시점을 확인하고 언제든 연결을 해제할 수 있습니다.</BodyText>
          <Button variant="secondary" onPress={() => router.replace("/mypage?tab=account")}>계정으로 돌아가기</Button>
        </Stack>
      </Panel>

      {isLoading ? <Card><BodyText>연결 상태를 확인하고 있습니다.</BodyText></Card> : null}
      {message ? (
        <View accessibilityLiveRegion="polite">
          <Card><BodyText>{message}</BodyText></Card>
        </View>
      ) : null}
      {!isLoading && connections.length === 0 ? (
        <Card><BodyText>활성 살롱 연결이 없습니다.</BodyText></Card>
      ) : null}

      {connections.map((connection) => (
        <Panel key={connection.id}>
          <Stack>
            <Heading style={{ fontSize: 22, lineHeight: 28 }}>{connection.salon.shopName}</Heading>
            <BodyText>{[connection.salon.region, connection.salon.managerName].filter(Boolean).join(" · ") || "HairFit 제휴 살롱"}</BodyText>
            <Cluster>
              <Chip tone={connection.status === "linked" ? "success" : "accent"}>{connection.status === "linked" ? "연결됨" : "확인 대기"}</Chip>
              <Chip>동의 {formatDate(connection.consentedAt)}</Chip>
            </Cluster>
            <Button variant="secondary" disabled={pendingId === connection.id} onPress={() => confirmRevoke(connection)}>
              {pendingId === connection.id ? "해제 중..." : "연결 해제"}
            </Button>
          </Stack>
        </Panel>
      ))}
    </AppScreen>
  );
}
