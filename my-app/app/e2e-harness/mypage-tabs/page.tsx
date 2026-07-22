import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MyPageTabNavigationHarness } from "../../../components/e2e/MyPageTabNavigationHarness";

export const metadata: Metadata = {
  title: "MyPage Tabs E2E Harness",
  robots: { index: false, follow: false },
};

export default function MyPageTabsE2EPage() {
  if (process.env.E2E_UI_HARNESS_ENABLED !== "true") {
    notFound();
  }

  return <MyPageTabNavigationHarness />;
}
