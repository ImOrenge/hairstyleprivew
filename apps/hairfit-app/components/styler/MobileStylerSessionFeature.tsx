import { MobileStylerSessionView } from "./MobileStylerSessionView";
import { useMobileStylerSessionController } from "./useMobileStylerSessionController";

export function MobileStylerSessionFeature() {
  const controller = useMobileStylerSessionController();
  return <MobileStylerSessionView controller={controller} />;
}
