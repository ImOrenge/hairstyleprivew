import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export type MotionAwareModalAnimation = "fade" | "none" | "slide";

/**
 * Starts motion-disabled until the operating-system preference is known.
 * If the native query fails, decorative motion remains disabled.
 */
export function useReducedMotionPreference() {
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => {
        if (mounted) setReduceMotion(true);
      });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

export function resolveMotionAwareModalAnimation(
  reduceMotion: boolean | null,
  preferredAnimation: Exclude<MotionAwareModalAnimation, "none">,
): MotionAwareModalAnimation {
  return reduceMotion === false ? preferredAnimation : "none";
}
