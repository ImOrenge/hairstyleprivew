"use client";

import { useEffect } from "react";

const GLOW_TARGET_SELECTOR = [
  ".app-panel",
  ".app-panel-muted",
  ".app-card",
  ".app-card-plain",
  ".app-inverse",
  ".app-inverse-card",
  ".app-inverse-card-strong",
  ".hf-panel",
  ".hf-panel-inverse",
].join(",");

export function PointerGlowProvider() {
  useEffect(() => {
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (!canHover.matches || reduceMotion.matches) {
      return;
    }

    let activeSurface: HTMLElement | null = null;
    let frameId = 0;
    let latestEvent: PointerEvent | null = null;

    const clearActiveSurface = () => {
      if (!activeSurface) {
        return;
      }

      activeSurface.style.setProperty("--glow-opacity", "0");
      activeSurface = null;
    };

    const updateGlow = () => {
      frameId = 0;

      if (!latestEvent) {
        return;
      }

      const event = latestEvent;
      latestEvent = null;
      const target = event.target instanceof Element ? event.target : null;
      const surface = target?.closest(GLOW_TARGET_SELECTOR);

      if (!(surface instanceof HTMLElement)) {
        clearActiveSurface();
        return;
      }

      if (surface !== activeSurface) {
        clearActiveSurface();
        activeSurface = surface;
      }

      const rect = surface.getBoundingClientRect();
      surface.style.setProperty("--glow-x", `${event.clientX - rect.left}px`);
      surface.style.setProperty("--glow-y", `${event.clientY - rect.top}px`);
      surface.style.setProperty("--glow-opacity", "1");
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") {
        clearActiveSurface();
        return;
      }

      latestEvent = event;

      if (!frameId) {
        frameId = window.requestAnimationFrame(updateGlow);
      }
    };

    const handlePointerOut = (event: PointerEvent) => {
      if (!event.relatedTarget) {
        clearActiveSurface();
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerout", handlePointerOut, { passive: true });
    window.addEventListener("blur", clearActiveSurface);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerout", handlePointerOut);
      window.removeEventListener("blur", clearActiveSurface);

      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }

      clearActiveSurface();
    };
  }, []);

  return null;
}
