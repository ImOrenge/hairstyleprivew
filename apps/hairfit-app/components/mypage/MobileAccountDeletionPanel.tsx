import { useAuth } from "@clerk/clerk-expo";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  ACCOUNT_DELETION_DISCLOSURE,
} from "@hairfit/shared";
import { BodyText, Button, Card, Heading, Kicker, Stack } from "@hairfit/ui-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import { clearDeletedAccountLocalState } from "../../lib/account-deletion";
import { useHairfitApi } from "../../lib/api";
import { mapMobileUserError } from "../../lib/mobile-user-message";

export function MobileAccountDeletionPanel() {
  const api = useHairfitApi();
  const router = useRouter();
  const { signOut, userId } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteAccount = async () => {
    if (!userId || pending) return;
    setPending(true);
    setError(null);

    try {
      await api.deleteAccount(ACCOUNT_DELETION_CONFIRMATION);
      const cleanup = await clearDeletedAccountLocalState({
        customerId: userId,
        signOut,
      });
      router.replace("/login");
      if (!cleanup.localCleanupCompleted) {
        console.warn("[account-delete] Local cleanup needs a device retry", {
          errorKind: "local_cleanup_incomplete",
        });
      }
    } catch (deleteError) {
      setError(
        mapMobileUserError(
          deleteError,
          "회원 탈퇴를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        ),
      );
      setPending(false);
    }
  };

  const confirmDeletion = () => {
    if (!userId || pending) return;
    Alert.alert(
      "회원 탈퇴",
      `${ACCOUNT_DELETION_DISCLOSURE}\n\n계속하면 이 작업은 되돌릴 수 없습니다.`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "영구 삭제",
          style: "destructive",
          onPress: () => void deleteAccount(),
        },
      ],
    );
  };

  return (
    <Card>
      <Stack gap={10}>
        <Kicker>위험 영역</Kicker>
        <Heading>회원 탈퇴</Heading>
        <BodyText>{ACCOUNT_DELETION_DISCLOSURE}</BodyText>
        {error ? (
          <View accessibilityLiveRegion="assertive" accessibilityRole="alert">
            <BodyText>{error}</BodyText>
          </View>
        ) : null}
        <Button
          variant="secondary"
          disabled={!userId || pending}
          loading={pending}
          loadingLabel="계정 삭제 중..."
          onPress={confirmDeletion}
        >
          회원 탈퇴 시작
        </Button>
      </Stack>
    </Card>
  );
}
