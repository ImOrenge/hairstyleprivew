"use client";

import { StylerNewView } from "./StylerNewView";
import { useStylerNewController } from "./useStylerNewController";

export function StylerNewFeature() {
  const controller = useStylerNewController();
  return <StylerNewView controller={controller} />;
}
