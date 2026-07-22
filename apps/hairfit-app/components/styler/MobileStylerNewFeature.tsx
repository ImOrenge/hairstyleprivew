import { useSafeBackNavigation } from "../../hooks/useSafeBackNavigation";
import { MobileStylerNewView } from "./MobileStylerNewView";
import { useMobileStylerNewController } from "./useMobileStylerNewController";

export function MobileStylerNewFeature() {
  const controller = useMobileStylerNewController();
  const navigateBack = useSafeBackNavigation({
    blocked: controller.isBackNavigationBlocked,
    fallback: "/mypage",
    mode: "replace",
    onBlocked: controller.notifyBackNavigationBlocked,
  });
  return <MobileStylerNewView controller={controller} onExit={navigateBack} />;
}
