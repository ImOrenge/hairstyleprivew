import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import {
  resolveMotionAwareModalAnimation,
  useReducedMotionPreference,
} from "../hooks/useReducedMotionPreference";

describe("mobile reduced-motion preference", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("disables decorative modal motion until motion is explicitly allowed", () => {
    expect(resolveMotionAwareModalAnimation(null, "fade")).toBe("none");
    expect(resolveMotionAwareModalAnimation(true, "slide")).toBe("none");
    expect(resolveMotionAwareModalAnimation(false, "fade")).toBe("fade");
    expect(resolveMotionAwareModalAnimation(false, "slide")).toBe("slide");
  });

  test("tracks operating-system changes and removes its listener", async () => {
    let listener: ((enabled: boolean) => void) | null = null;
    const remove = jest.fn();
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation((event, handler) => {
      expect(event).toBe("reduceMotionChanged");
      listener = handler as unknown as (enabled: boolean) => void;
      return { remove } as never;
    });

    const { result, unmount } = await renderHook(() => useReducedMotionPreference());
    await waitFor(() => expect(result.current).toBe(true));

    await act(() => listener?.(false));
    expect(result.current).toBe(false);

    await act(() => unmount());
    expect(remove).toHaveBeenCalledTimes(1);
  });

  test("keeps motion disabled when the native preference cannot be read", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockRejectedValue(new Error("unavailable"));
    jest.spyOn(AccessibilityInfo, "addEventListener").mockReturnValue({ remove: jest.fn() } as never);

    const { result, unmount } = await renderHook(() => useReducedMotionPreference());
    await waitFor(() => expect(result.current).toBe(true));
    await act(() => unmount());
  });
});
