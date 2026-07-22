import { ScrollView, StyleSheet } from "react-native";
import { Button, Panel } from "@hairfit/ui-native";
import {
  MOBILE_MY_PAGE_TABS,
  type MobileMyPageTabId,
} from "../../lib/mypage";

interface MobileMyPageTabNavigationProps {
  activeTab: MobileMyPageTabId;
  onSelectTab: (tab: MobileMyPageTabId) => void;
}

export function MobileMyPageTabNavigation({
  activeTab,
  onSelectTab,
}: MobileMyPageTabNavigationProps) {
  return (
    <Panel style={styles.tabPanel}>
      <ScrollView
        horizontal
        accessibilityRole="tablist"
        contentContainerStyle={styles.tabScrollerContent}
        showsHorizontalScrollIndicator={false}
      >
        {MOBILE_MY_PAGE_TABS.map((tab) => (
          <Button
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab.id }}
            variant={activeTab === tab.id ? "primary" : "secondary"}
            onPress={() => onSelectTab(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </ScrollView>
    </Panel>
  );
}

const styles = StyleSheet.create({
  tabPanel: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  tabScrollerContent: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 8,
  },
});
