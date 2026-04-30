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

    if (!canHover.matches) {
      return;
    }

    const activeSurfaces = new Set<HTMLElement>();
    let frameId = 0;
    let latestEvent: PointerEvent | null = null;
    const maxDistance = 680;

    const clearSurfaces = () => {
      activeSurfaces.forEach((surface) => {
        surface.style.setProperty("--glow-opacity", "0");
      });
      activeSurfaces.clear();
    };

    const updateGlow = () => {
      frameId = 0;

      if (!latestEvent) {
        return;
      }

      const event = latestEvent;
      latestEvent = null;
      const surfaces = document.querySelectorAll<HTMLElement>(GLOW_TARGET_SELECTOR);
      const nextActiveSurfaces = new Set<HTMLElement>();

      surfaces.forEach((surface) => {
        const rect = surface.getBoundingClientRect();
        const isNearViewport =
          rect.bottom >= -maxDistance &&
          rect.top <= window.innerHeight + maxDistance &&
          rect.right >= -maxDistance &&
          rect.left <= window.innerWidth + maxDistance;

        if (!isNearViewport) {
          surface.style.setProperty("--glow-opacity", "0");
          return;
        }

        const nearestX = Math.min(Math.max(event.clientX, rect.left), rect.right);
        const nearestY = Math.min(Math.max(event.clientY, rect.top), rect.bottom);
        const distance = Math.hypot(event.clientX - nearestX, event.clientY - nearestY);
        const intensity = Math.max(0, 1 - distance / maxDistance);

        surface.style.setProperty("--glow-x", `${event.clientX - rect.left}px`);
        surface.style.setProperty("--glow-y", `${event.clientY - rect.top}px`);
        surface.style.setProperty("--glow-opacity", `${Math.pow(intensity, 1.15).toFixed(3)}`);

        if (intensity > 0) {
          nextActiveSurfaces.add(surface);
        }
      });

      activeSurfaces.forEach((surface) => {
        if (!nextActiveSurfaces.has(surface)) {
          surface.style.setProperty("--glow-opacity", "0");
        }
      });

      activeSurfaces.clear();
      nextActiveSurfaces.forEach((surface) => activeSurfaces.add(surface));
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") {
        clearSurfaces();
        return;
      }

      latestEvent = event;

      if (!frameId) {
        frameId = window.requestAnimationFrame(updateGlow);
      }
    };

    const handlePointerOut = (event: PointerEvent) => {
      if (!event.relatedTarget) {
        clearSurfaces();
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerout", handlePointerOut, { passive: true });
    window.addEventListener("blur", clearSurfaces);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerout", handlePointerOut);
      window.removeEventListener("blur", clearSurfaces);

      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }

      clearSurfaces();
    };
  }, []);

  return null;
}
