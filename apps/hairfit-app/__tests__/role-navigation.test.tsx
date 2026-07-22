import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import { RoleNavigationScaffold } from "../components/app/RoleNavigationScaffold";
import {
  getRoleNavigationItems,
  isRoleNavigationHidden,
  isRoleNavigationItemActive,
  readAccountTypeMetadata,
  resolveRoleNavigationRole,
} from "../lib/role-navigation";

let mockPathname = "/admin/stats";
let mockAccountType: "member" | "salon_owner" | "admin" = "admin";
const mockReplace = jest.fn();

jest.mock("@clerk/clerk-expo", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    sessionClaims: { publicMetadata: { accountType: mockAccountType } },
  }),
  useUser: () => ({ isLoaded: true, user: { publicMetadata: { accountType: mockAccountType } } }),
}));

jest.mock("expo-router", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock("react-native-safe-area-context", () => {
  const ReactModule = jest.requireActual<typeof import("react")>("react");
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");

  return {
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) =>
      ReactModule.createElement(View, props, children),
  };
});

describe("role navigation contracts", () => {
  beforeEach(() => {
    mockPathname = "/admin/stats";
    mockAccountType = "admin";
    mockReplace.mockReset();
  });

  test("normalizes nested Clerk metadata and keeps role routes deterministic", () => {
    expect(readAccountTypeMetadata({ public_metadata: { accountType: "salon_owner" } })).toBe("salon_owner");
    expect(resolveRoleNavigationRole(null, "/admin/members")).toBe("admin");
    expect(resolveRoleNavigationRole(null, "/salon/connections")).toBe("customer");
    expect(getRoleNavigationItems("customer").map((item) => item.label)).toEqual(["홈", "생성", "기록", "계정"]);
    expect(
      getRoleNavigationItems("admin")
        .filter((item) => isRoleNavigationItemActive("/admin/members/123", item))
        .map((item) => item.label),
    ).toEqual(["회원"]);
    expect(isRoleNavigationHidden("/generate/123")).toBe(true);
    expect(isRoleNavigationHidden("/aftercare/123")).toBe(true);
    expect(isRoleNavigationHidden("/admin/stats")).toBe(false);
  });

  test("renders the active role tabs and replaces the stack for primary navigation", async () => {
    await render(
      <RoleNavigationScaffold>
        <Text>관리자 화면</Text>
      </RoleNavigationScaffold>,
    );

    expect(screen.getByLabelText("관리자 주요 내비게이션")).toBeOnTheScreen();
    expect(screen.getByRole("tab", { name: "통계" })).toBeSelected();

    await fireEvent.press(screen.getByRole("tab", { name: "회원" }));
    expect(mockReplace).toHaveBeenCalledWith("/admin/members");
  });

  test("does not expose role navigation during focused generation work", async () => {
    mockPathname = "/generate/123";
    mockAccountType = "member";

    await render(
      <RoleNavigationScaffold>
        <Text>생성 화면</Text>
      </RoleNavigationScaffold>,
    );

    expect(screen.queryByRole("tablist")).not.toBeOnTheScreen();
  });
});
