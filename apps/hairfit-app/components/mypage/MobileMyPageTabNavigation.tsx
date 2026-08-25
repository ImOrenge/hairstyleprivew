import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  MOBILE_MY_PAGE_TABS,
  type MobileMyPageTabId,
} from "../../lib/mypage";
import { customerColors } from "../../lib/customer-ui";

interface MobileMyPageTabNavigationProps {
  activeTab: MobileMyPageTabId;
  onSelectTab: (tab: MobileMyPageTabId) => void;
}

export function MobileMyPageTabNavigation({
  activeTab,
  onSelectTab,
}: MobileMyPageTabNavigationProps) {
  return (
    <View style={styles.tabPanel}>
      <ScrollView
        horizontal
        accessibilityRole="tablist"
        contentContainerStyle={styles.tabScrollerContent}
        showsHorizontalScrollIndicator={false}
      >
        {MOBILE_MY_PAGE_TABS.map((tab) => (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab.id }}
            onPress={() => onSelectTab(tab.id)}
            style={[styles.tab, activeTab === tab.id ? styles.tabSelected : null]}
          >
            <Text style={[styles.tabLabel, activeTab === tab.id ? styles.tabLabelSelected : null]}>{tab.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabPanel: {
    backgroundColor: customerColors.surface,
    borderColor: customerColors.line,
    borderRadius: 16,
    borderWidth: 1,
    padding: 7,
  },
  tabScrollerContent: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 8,
  },
  tab: {
    alignItems: "center",
    backgroundColor: customerColors.raised,
    borderColor: customerColors.line,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 15,
  },
  tabSelected: {
    backgroundColor: customerColors.champagne,
    borderColor: customerColors.champagne,
  },
  tabLabel: {
    color: customerColors.ivory,
    fontSize: 13,
    fontWeight: "800",
  },
  tabLabelSelected: {
    color: customerColors.canvas,
  },
});
