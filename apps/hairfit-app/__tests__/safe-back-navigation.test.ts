import { consumeSafeBackNavigation } from "../hooks/useSafeBackNavigation";

const back = jest.fn();
const canGoBack = jest.fn();
const replace = jest.fn();
const router = { back, canGoBack, replace };

describe("safe back navigation contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses router history when a previous screen exists", () => {
    canGoBack.mockReturnValue(true);

    expect(consumeSafeBackNavigation({ fallback: "/mypage", router })).toBe(true);
    expect(back).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it("replaces with the fallback when history is unavailable", () => {
    canGoBack.mockReturnValue(false);

    expect(consumeSafeBackNavigation({ fallback: "/mypage", router })).toBe(true);
    expect(replace).toHaveBeenCalledWith("/mypage");
    expect(back).not.toHaveBeenCalled();
  });

  it("blocks navigation while a critical request is in flight", () => {
    const onBlocked = jest.fn();

    expect(consumeSafeBackNavigation({
      blocked: true,
      fallback: "/mypage",
      onBlocked,
      router,
    })).toBe(true);
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("lets a screen consume back before navigation", () => {
    const onBeforeNavigate = jest.fn(() => true);

    expect(consumeSafeBackNavigation({
      fallback: "/mypage",
      onBeforeNavigate,
      router,
    })).toBe(true);
    expect(onBeforeNavigate).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("uses replacement mode even when router history exists", () => {
    canGoBack.mockReturnValue(true);

    expect(consumeSafeBackNavigation({
      fallback: "/mypage",
      mode: "replace",
      router,
    })).toBe(true);
    expect(replace).toHaveBeenCalledWith("/mypage");
    expect(back).not.toHaveBeenCalled();
  });
});
