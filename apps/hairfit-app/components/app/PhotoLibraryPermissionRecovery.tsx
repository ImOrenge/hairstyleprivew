import {
  BodyText,
  Button,
  Card,
  Stack,
} from "@hairfit/ui-native/primitives";
import { View } from "react-native";

export interface PhotoLibraryPermissionRecoveryProps {
  onOpenSettings: () => void;
  visible: boolean;
}

export function PhotoLibraryPermissionRecovery({
  onOpenSettings,
  visible,
}: PhotoLibraryPermissionRecoveryProps) {
  if (!visible) return null;

  return (
    <View
      accessibilityLiveRegion="polite"
      testID="photo-library-permission-recovery"
    >
      <Card>
        <Stack>
          <BodyText>
            사진 접근이 차단되어 앱에서 다시 권한을 요청할 수 없습니다. 앱 설정에서 사진 권한을 허용해 주세요.
          </BodyText>
          <Button
            accessibilityHint="운영체제의 HairFit 앱 설정을 엽니다."
            onPress={onOpenSettings}
            variant="secondary"
          >
            앱 설정 열기
          </Button>
        </Stack>
      </Card>
    </View>
  );
}
