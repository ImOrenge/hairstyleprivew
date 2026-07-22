import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import type { MobileConfirmedStyle } from "@hairfit/shared";
import { MobileMyPageAftercarePanel } from "../components/mypage/panels/MobileMyPageAftercarePanel";

const mockPush = jest.fn();
const mockRouter = {
  back: jest.fn(),
  canGoBack: () => false,
  push: mockPush,
  replace: jest.fn(),
};

jest.mock("@clerk/clerk-expo", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, sessionClaims: {} }),
  useUser: () => ({ isLoaded: true, user: { publicMetadata: { accountType: "member" } } }),
}));

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
}));

const confirmedStyle: MobileConfirmedStyle = {
  id: "hair-record-1",
  generationId: "generation-1",
  styleName: "내추럴 레이어드 컷",
  serviceType: "cut",
  serviceDate: "2026-07-17",
  nextVisitTargetDays: 30,
  selectedVariantId: "variant-2",
  selectedVariantImageUrl: "https://example.com/confirmed-style.jpg",
  confirmedAt: "2026-07-17T02:00:00.000Z",
};

describe("confirmed style list", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("shows the confirmed hairstyle as an image card and opens its care guide", async () => {
    await render(<MobileMyPageAftercarePanel confirmedStyles={[confirmedStyle]} />);

    expect(screen.getByText("시술 확정 목록")).toBeOnTheScreen();
    expect(screen.getByText("내추럴 레이어드 컷")).toBeOnTheScreen();
    expect(screen.getByLabelText("내추럴 레이어드 컷 시술 확정 스타일")).toBeOnTheScreen();

    fireEvent.press(screen.getByRole("button", { name: "관리 가이드 보기" }));
    expect(mockPush).toHaveBeenCalledWith("/aftercare/hair-record-1");
  });

  test("keeps a useful empty state before the first treatment confirmation", async () => {
    await render(<MobileMyPageAftercarePanel confirmedStyles={[]} />);

    expect(screen.getByText("아직 시술 확정한 스타일이 없습니다.")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "관리 가이드 보기" })).not.toBeOnTheScreen();
  });
});
