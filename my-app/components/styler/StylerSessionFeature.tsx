"use client";

import { StylerSessionView } from "./StylerSessionView";
import { useStylerSessionController } from "./useStylerSessionController";

export function StylerSessionFeature() {
  const controller = useStylerSessionController();
  return <StylerSessionView controller={controller} />;
}
