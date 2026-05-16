import { useAuth } from "@clerk/clerk-expo";
import type { SalonMatchInviteResponse } from "@hairfit/api-client";
import { BodyText, Button, Card, Chip, Cluster, Heading, Kicker, Panel, Screen, Stack } from "@hairfit/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useHairfitApi } from "../../../lib/api";

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function SalonMatchScreen() {
  const api = useHairfitApi();
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const inviteCode = typeof code === "string" ? code : "";
  const { isLoaded, isSignedIn } = useAuth();
  const [invite, setInvite] = useState<SalonMatchInviteResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!inviteCode) return;
      setIsLoading(true);
      setMessage(null);
      try {
        const result = await api.getSalonMatchInvite(inviteCode);
        if (!cancelled) {
          setInvite(result);
        }
      } catch (loadError) {
        if (!cancelled) {
          setInvite(null);
          setMessage(loadError instanceof Error ? loadError.message : "초대 정보를 불러오지 못했습니다.");
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
  }, [api, inviteCode]);

  const acceptInvite = async () => {
    if (!inviteCode || pending) return;
    if (!isLoaded || !isSignedIn) {
      router.push("/login");
      return;
    }

    setPending(true);
    setMessage(null);
    try {
      const result = await api.acceptSalonMatchInvite(inviteCode);
      setMessage(result.status === "linked" ? "이미 연결된 살롱입니다." : "살롱 연결 요청을 보냈습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "살롱 연결 요청에 실패했습니다.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Screen>
      <Panel>
        <Stack>
          <Kicker>Salon Match</Kicker>
          <Heading>{invite?.salon.shopName || "살롱 연결 초대"}</Heading>
          <BodyText>Next.js 살롱 매칭 초대와 같은 초대 조회/수락 API를 사용합니다.</BodyText>
          {invite ? (
            <Cluster>
              <Chip>{invite.authenticated ? "로그인됨" : "로그인 필요"}</Chip>
              {invite.existingStatus ? <Chip>{invite.existingStatus}</Chip> : null}
              <Chip>만료 {formatDate(invite.invite.expiresAt)}</Chip>
            </Cluster>
          ) : null}
        </Stack>
      </Panel>

      {isLoading ? (
        <Card>
          <BodyText>초대 정보를 불러오는 중입니다.</BodyText>
        </Card>
      ) : null}

      {invite ? (
        <Panel>
          <Stack>
            <Heading style={{ fontSize: 22, lineHeight: 28 }}>{invite.salon.shopName}</Heading>
            <BodyText>{invite.salon.introduction || "살롱 소개가 없습니다."}</BodyText>
            <BodyText>{invite.salon.managerName || "담당자 미등록"}</BodyText>
            <BodyText>{invite.salon.contactPhone || "연락처 미등록"}</BodyText>
            <BodyText>{invite.salon.region || "지역 미등록"}</BodyText>
            {invite.salon.instagramHandle ? <BodyText>@{invite.salon.instagramHandle}</BodyText> : null}
            <Button disabled={pending} onPress={acceptInvite}>
              {pending ? "요청 중..." : isSignedIn ? "살롱 연결 요청" : "로그인하고 연결"}
            </Button>
          </Stack>
        </Panel>
      ) : null}

      {message ? (
        <Card>
          <BodyText>{message}</BodyText>
        </Card>
      ) : null}
    </Screen>
  );
}
