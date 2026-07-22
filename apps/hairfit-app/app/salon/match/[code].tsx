import { useAuth } from "@clerk/clerk-expo";
import type { SalonMatchInviteResponse } from "@hairfit/api-client";
import { createSalonConnectionConsentAcceptance } from "@hairfit/shared";
import { BodyText, Button, Card, Chip, Cluster, Heading, Kicker, Panel, Stack } from "@hairfit/ui-native";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Switch, View } from "react-native";
import { AppScreen } from "../../../components/app/AppScreen";
import { useHairfitApi } from "../../../lib/api";
import { buildAuthRoute, saveSalonMatchResumeTarget } from "../../../lib/auth-resume";
import { mapMobileUserError } from "../../../lib/mobile-user-message";

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
  const [consentChecked, setConsentChecked] = useState(false);

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
          setMessage(mapMobileUserError(loadError, "초대 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
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
      const target = await saveSalonMatchResumeTarget(inviteCode);
      router.push(buildAuthRoute("/login", target) as Href);
      return;
    }

    setPending(true);
    setMessage(null);
    try {
      const result = await api.acceptSalonMatchInvite(inviteCode, createSalonConnectionConsentAcceptance());
      setMessage(result.status === "linked" ? "이미 연결된 살롱입니다." : "살롱 연결 요청을 보냈습니다.");
    } catch (error) {
      setMessage(mapMobileUserError(error, "살롱 연결 요청에 실패했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      setPending(false);
    }
  };

  return (
    <AppScreen>
      <Panel>
        <Stack>
          <Kicker>살롱 연결</Kicker>
          <Heading>{invite?.salon.shopName || "살롱 연결 초대"}</Heading>
          <BodyText>공유 범위와 연결 해제 후 처리 방식을 확인한 뒤 동의할 수 있습니다.</BodyText>
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
            {invite.existingStatus === "pending" || invite.existingStatus === "linked" ? (
              <>
                <Card>
                  <BodyText>{invite.existingStatus === "linked" ? "이미 연결된 살롱입니다." : "살롱의 연결 확인을 기다리고 있습니다."}</BodyText>
                </Card>
                <Button variant="secondary" onPress={() => router.push("/salon/connections")}>연결 상태 확인·해제</Button>
              </>
            ) : (
              <>
                <Card>
                  <Stack gap={10}>
                    <Kicker>연결 동의 안내</Kicker>
                    <BodyText>{invite.consent.copy.purpose}</BodyText>
                    <BodyText style={{ fontWeight: "900" }}>살롱에 공유</BodyText>
                    {invite.consent.copy.sharedItems.map((item) => <BodyText key={item}>• {item}</BodyText>)}
                    <BodyText style={{ fontWeight: "900" }}>공유하지 않음</BodyText>
                    {invite.consent.copy.excludedItems.map((item) => <BodyText key={item}>• {item}</BodyText>)}
                    <BodyText>{invite.consent.copy.retention}</BodyText>
                    <BodyText>{invite.consent.copy.revocation}</BodyText>
                  </Stack>
                </Card>
                <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
                  <Switch accessibilityLabel="살롱 연결 동의" onValueChange={setConsentChecked} value={consentChecked} />
                  <BodyText style={{ flex: 1 }}>공유 범위와 해제 후 처리를 확인했으며 살롱 연결에 동의합니다.</BodyText>
                </View>
                <Button disabled={pending || !consentChecked} onPress={acceptInvite}>
                  {pending ? "동의 처리 중..." : isSignedIn ? "동의하고 연결 요청" : "동의하고 로그인"}
                </Button>
                <Button variant="secondary" onPress={() => router.replace("/mypage")}>동의하지 않음</Button>
              </>
            )}
          </Stack>
        </Panel>
      ) : null}

      {message ? (
        <View accessibilityLiveRegion="polite">
          <Card>
            <BodyText>{message}</BodyText>
          </Card>
        </View>
      ) : null}
    </AppScreen>
  );
}
