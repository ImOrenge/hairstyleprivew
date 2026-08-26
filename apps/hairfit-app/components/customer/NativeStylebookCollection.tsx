import type {
  CustomerStylebookFashionEntryV2,
  CustomerStylebookV2,
  CustomerStylebookViewV2,
} from "@hairfit/shared";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { customerColors } from "../../lib/customer-ui";
import { CustomerBody, CustomerCard, CustomerHeading, CustomerKicker } from "./CustomerPrimitives";

const FASHION_CATEGORY_LABELS: Record<CustomerStylebookFashionEntryV2["category"], string> = {
  DAILY: "데일리",
  WORK: "워크",
  STATEMENT: "포인트",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function safePaletteColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : customerColors.champagne;
}

export function NativeStylebookCollection({
  collection,
  activeView,
  onViewChange,
  onOpenConsultation,
  onStartConsultation,
}: {
  collection: CustomerStylebookV2;
  activeView: CustomerStylebookViewV2;
  onViewChange: (view: CustomerStylebookViewV2) => void;
  onOpenConsultation: (consultationId: string) => void;
  onStartConsultation: () => void;
}) {
  const entries = collection[activeView];
  const isFashion = activeView === "fashion";

  return (
    <View style={styles.collection}>
      <View accessibilityRole="tablist" style={styles.tabs}>
        {([
          ["hair", "헤어 스타일", collection.hair.length],
          ["fashion", "패션 룩", collection.fashion.length],
        ] as const).map(([view, label, count]) => {
          const selected = activeView === view;
          return (
            <Pressable
              key={view}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onViewChange(view)}
              style={({ pressed }) => [styles.tab, selected ? styles.tabSelected : null, pressed ? styles.pressed : null]}
            >
              <Text style={[styles.tabLabel, selected ? styles.tabLabelSelected : null]}>{label}</Text>
              <Text style={[styles.tabCount, selected ? styles.tabCountSelected : null]}>{count}</Text>
            </Pressable>
          );
        })}
      </View>

      {entries.length === 0 ? (
        <CustomerCard style={styles.emptyCard}>
          <CustomerKicker>Your collection</CustomerKicker>
          <CustomerHeading compact>
            {isFashion ? "아직 확정한 패션 룩이 없어요" : "첫 헤어 스타일을 만들어 볼까요?"}
          </CustomerHeading>
          <CustomerBody>
            {isFashion
              ? "컨설팅 마지막 단계에서 패션 룩을 확정하면 이곳에서 다시 확인할 수 있어요."
              : "컨설팅을 완료하면 최종 확정한 헤어 스타일이 자동으로 이곳에 모입니다."}
          </CustomerBody>
          <Pressable accessibilityRole="button" onPress={onStartConsultation} style={styles.emptyAction}>
            <Text style={styles.emptyActionLabel}>컨설팅 시작</Text>
          </Pressable>
        </CustomerCard>
      ) : null}

      {activeView === "hair"
        ? collection.hair.map((entry) => (
            <Pressable
              key={entry.id}
              accessibilityRole="button"
              accessibilityLabel={`${entry.title} 최종 리포트 열기`}
              onPress={() => onOpenConsultation(entry.consultationId)}
              style={({ pressed }) => pressed ? styles.pressed : null}
            >
              <CustomerCard style={styles.card}>
                <View style={styles.preview}>
                  {entry.imageUrl ? (
                    <Image accessibilityLabel={entry.title} accessibilityRole="image" source={{ uri: entry.imageUrl }} style={styles.previewImage} />
                  ) : (
                    <View style={styles.placeholder}><Text style={styles.placeholderText}>HF</Text></View>
                  )}
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.metaRow}>
                    <CustomerKicker>컨설팅 최종 리포트</CustomerKicker>
                    <Text style={styles.date}>{formatDate(entry.confirmedAt)}</Text>
                  </View>
                  <CustomerHeading compact>{entry.title}</CustomerHeading>
                  <CustomerBody>{entry.description}</CustomerBody>
                  <Text style={styles.openLabel}>최종 리포트 보기 →</Text>
                </View>
              </CustomerCard>
            </Pressable>
          ))
        : collection.fashion.map((entry) => (
            <Pressable
              key={entry.id}
              accessibilityRole="button"
              accessibilityLabel={`${entry.title} 패션 최종 리포트 열기`}
              onPress={() => onOpenConsultation(entry.consultationId)}
              style={({ pressed }) => pressed ? styles.pressed : null}
            >
              <CustomerCard style={styles.card}>
                <View style={styles.preview}>
                  {entry.imageUrl ? (
                    <Image accessibilityLabel={entry.title} accessibilityRole="image" source={{ uri: entry.imageUrl }} style={styles.previewImage} />
                  ) : (
                    <View style={styles.placeholder}><Text style={styles.placeholderText}>LOOK</Text></View>
                  )}
                  <View style={styles.finalBadge}><Text style={styles.finalBadgeLabel}>최종 확정</Text></View>
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.metaRow}>
                    <CustomerKicker>{FASHION_CATEGORY_LABELS[entry.category]} · {entry.genre}</CustomerKicker>
                    <Text style={styles.date}>{formatDate(entry.confirmedAt)}</Text>
                  </View>
                  <CustomerHeading compact>{entry.title}</CustomerHeading>
                  <CustomerBody>{entry.silhouette} · {entry.neckline}</CustomerBody>
                  <View accessibilityLabel={`추천 팔레트 ${entry.palette.length}색`} style={styles.palette}>
                    {entry.palette.slice(0, 5).map((color, index) => (
                      <View key={`${entry.id}-${color}-${index}`} style={[styles.swatch, { backgroundColor: safePaletteColor(color) }]} />
                    ))}
                  </View>
                  <Text style={styles.openLabel}>패션 최종 리포트 보기 →</Text>
                </View>
              </CustomerCard>
            </Pressable>
          ))}
    </View>
  );
}

const styles = StyleSheet.create({
  collection: { gap: 14 },
  tabs: { backgroundColor: customerColors.surface, borderColor: customerColors.line, borderRadius: 999, borderWidth: 1, flexDirection: "row", padding: 4 },
  tab: { alignItems: "center", borderRadius: 999, flex: 1, flexDirection: "row", gap: 7, justifyContent: "center", minHeight: 48, paddingHorizontal: 12 },
  tabSelected: { backgroundColor: customerColors.ivory },
  tabLabel: { color: customerColors.muted, fontSize: 13, fontWeight: "800" },
  tabLabelSelected: { color: customerColors.canvas },
  tabCount: { backgroundColor: customerColors.raised, borderRadius: 999, color: customerColors.muted, fontSize: 10, fontWeight: "800", minWidth: 20, overflow: "hidden", paddingHorizontal: 5, paddingVertical: 3, textAlign: "center" },
  tabCountSelected: { backgroundColor: customerColors.champagneSoft, color: customerColors.canvas },
  card: { padding: 0 },
  preview: { aspectRatio: 4 / 5, backgroundColor: customerColors.raised, position: "relative" },
  previewImage: { height: "100%", resizeMode: "cover", width: "100%" },
  placeholder: { alignItems: "center", flex: 1, justifyContent: "center" },
  placeholderText: { color: customerColors.champagne, fontFamily: "serif", fontSize: 48, letterSpacing: -3 },
  finalBadge: { backgroundColor: "rgba(17, 17, 15, 0.84)", borderColor: customerColors.lineStrong, borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, position: "absolute", right: 12, top: 12 },
  finalBadgeLabel: { color: customerColors.ivory, fontSize: 10, fontWeight: "800" },
  cardBody: { gap: 10, padding: 18 },
  metaRow: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between" },
  date: { color: customerColors.subtle, fontSize: 11 },
  palette: { flexDirection: "row", gap: 7 },
  swatch: { borderColor: customerColors.line, borderRadius: 999, borderWidth: 1, height: 20, width: 20 },
  openLabel: { color: customerColors.champagne, fontSize: 13, fontWeight: "800", paddingTop: 2 },
  emptyCard: { gap: 12, justifyContent: "center", minHeight: 300 },
  emptyAction: { alignItems: "center", backgroundColor: customerColors.champagne, borderRadius: 999, justifyContent: "center", minHeight: 50, paddingHorizontal: 20 },
  emptyActionLabel: { color: customerColors.canvas, fontSize: 14, fontWeight: "800" },
  pressed: { opacity: 0.86 },
});
