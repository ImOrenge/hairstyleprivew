import type {
  CustomerStylebookCollectionMutationV2,
  CustomerStylebookEntryV2,
  CustomerStylebookFashionEntryV2,
  CustomerStylebookItemRefV2,
  CustomerStylebookItemStatePatchV2,
  CustomerStylebookShareRequestV2,
  CustomerStylebookV2,
  CustomerStylebookViewV2,
  CustomerStylebookWearLogRequestV2,
} from "@hairfit/shared";
import { customerStylebookDisplayTitleV2, filterCustomerStylebookEntriesV2 } from "@hairfit/shared";
import * as ImagePicker from "expo-image-picker";
import { useMemo, useState } from "react";
import { Image, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { customerColors } from "../../lib/customer-ui";
import { CustomerBody, CustomerCard, CustomerHeading, CustomerKicker } from "./CustomerPrimitives";

const FASHION_CATEGORY_LABELS: Record<CustomerStylebookFashionEntryV2["category"], string> = {
  DAILY: "데일리",
  WORK: "워크",
  STATEMENT: "포인트",
};

type PhotoFile = { uri: string; name: string; type: string };
type EntryModal = "manage" | "wear" | "share" | null;

interface NativeStylebookCollectionProps {
  collection: CustomerStylebookV2;
  activeView: CustomerStylebookViewV2;
  busy?: boolean;
  onViewChange: (view: CustomerStylebookViewV2) => void;
  onOpenConsultation: (consultationId: string) => void;
  onStartConsultation: () => void;
  onUpdateItemState: (input: CustomerStylebookItemStatePatchV2) => Promise<void>;
  onMutateCollection: (input: CustomerStylebookCollectionMutationV2) => Promise<void>;
  onCreateWearLog: (input: CustomerStylebookWearLogRequestV2, photo: PhotoFile | null, photoConsent: boolean) => Promise<void>;
  onDeleteWearLog: (id: string) => Promise<void>;
  onCreateShare: (input: CustomerStylebookShareRequestV2) => Promise<string>;
  onRevokeShare: (id: string) => Promise<void>;
  onStartFromReference: (item: CustomerStylebookItemRefV2) => Promise<void>;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
}

function safePaletteColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : customerColors.champagne;
}

function itemRef(entry: CustomerStylebookEntryV2): CustomerStylebookItemRefV2 {
  return { kind: entry.kind, id: entry.id, consultationId: entry.consultationId };
}

function SmallButton({ children, active = false, disabled = false, onPress }: {
  children: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.smallButton,
        active ? styles.smallButtonActive : null,
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Text style={[styles.smallButtonLabel, active ? styles.smallButtonLabelActive : null]}>{children}</Text>
    </Pressable>
  );
}

function RatingInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.actionRow}>
        {[1, 2, 3, 4, 5].map((rating) => (
          <SmallButton key={rating} active={value === rating} onPress={() => onChange(rating)}>{String(rating)}</SmallButton>
        ))}
      </View>
    </View>
  );
}

function EntryPreview({ entry }: { entry: CustomerStylebookEntryV2 }) {
  return (
    <View style={styles.preview}>
      {entry.imageUrl ? (
        <Image accessibilityLabel={customerStylebookDisplayTitleV2(entry)} accessibilityRole="image" source={{ uri: entry.imageUrl }} style={styles.previewImage} />
      ) : (
        <View style={styles.placeholder}><Text style={styles.placeholderText}>{entry.kind === "hair" ? "HF" : "LOOK"}</Text></View>
      )}
      {entry.state.favorite ? <View style={styles.favoriteBadge}><Text style={styles.favoriteBadgeLabel}>♥</Text></View> : null}
      {entry.state.archivedAt ? <View style={styles.archiveBadge}><Text style={styles.archiveBadgeLabel}>보관됨</Text></View> : null}
    </View>
  );
}

function EntryCard({ collection, entry, compareSelected, busy, onOpen, onFavorite, onCompare, onModal, onStartFromReference }: {
  collection: CustomerStylebookV2;
  entry: CustomerStylebookEntryV2;
  compareSelected: boolean;
  busy: boolean;
  onOpen: () => void;
  onFavorite: () => void;
  onCompare: () => void;
  onModal: (modal: Exclude<EntryModal, null>) => void;
  onStartFromReference: () => void;
}) {
  const title = customerStylebookDisplayTitleV2(entry);
  const logs = collection.wearLogs.filter((log) => log.item.kind === entry.kind && log.item.id === entry.id);
  const latestLog = logs[0];
  const kindLabel = entry.kind === "hair" ? "헤어" : "패션";
  return (
    <CustomerCard style={styles.card}>
      <EntryPreview entry={entry} />
      <View style={styles.cardBody}>
        <View style={styles.metaRow}>
          <CustomerKicker>{entry.kind === "hair" ? "컨설팅 최종 리포트" : `${FASHION_CATEGORY_LABELS[entry.category]} · ${entry.genre}`}</CustomerKicker>
          <Text style={styles.date}>{formatDate(entry.confirmedAt)}</Text>
        </View>
        <CustomerHeading compact>{title}</CustomerHeading>
        <CustomerBody>{entry.kind === "hair" ? entry.description : `${entry.silhouette} · ${entry.neckline}`}</CustomerBody>
        {entry.state.tags.length ? <Text style={styles.tagLine}>{entry.state.tags.map((tag) => `#${tag}`).join("  ")}</Text> : null}
        {entry.kind === "fashion" ? (
          <View accessibilityLabel={`추천 팔레트 ${entry.palette.length}색`} style={styles.palette}>
            {entry.palette.slice(0, 5).map((color, index) => (
              <View key={`${entry.id}-${color}-${index}`} style={[styles.swatch, { backgroundColor: safePaletteColor(color) }]} />
            ))}
          </View>
        ) : null}
        {latestLog ? (
          <View style={styles.logSummary}>
            <Text style={styles.logSummaryTitle}>최근 실제 기록 · 만족 {latestLog.satisfaction}/5</Text>
            <Text style={styles.logSummaryBody}>{formatDate(latestLog.appliedOn)} · {latestLog.wouldRepeat ? "다시 선택" : "다른 방향 탐색"}</Text>
          </View>
        ) : null}
        <Pressable
          accessibilityLabel={`${title} ${kindLabel} 최종 리포트 열기`}
          accessibilityRole="button"
          onPress={onOpen}
          style={({ pressed }) => [styles.openAction, pressed ? styles.pressed : null]}
        >
          <Text style={styles.openLabel}>컨설팅 마지막 결과 보기 →</Text>
        </Pressable>
        <View style={styles.actionRow}>
          <SmallButton active={entry.state.favorite} disabled={busy} onPress={onFavorite}>{entry.state.favorite ? "즐겨찾기 해제" : "즐겨찾기"}</SmallButton>
          <SmallButton active={compareSelected} disabled={busy} onPress={onCompare}>{compareSelected ? "비교 선택됨" : "비교"}</SmallButton>
          <SmallButton disabled={busy} onPress={() => onModal("manage")}>정리</SmallButton>
          <SmallButton disabled={busy} onPress={() => onModal("wear")}>실제 기록</SmallButton>
          <SmallButton disabled={busy} onPress={() => onModal("share")}>공유·PDF</SmallButton>
          {entry.imageUrl ? <SmallButton disabled={busy} onPress={() => void Share.share({ title, message: `${title}\n${entry.imageUrl}`, url: entry.imageUrl ?? undefined })}>이미지 저장</SmallButton> : null}
          <SmallButton disabled={busy} onPress={onStartFromReference}>참고해 새 컨설팅</SmallButton>
        </View>
      </View>
    </CustomerCard>
  );
}

export function NativeStylebookCollection({
  collection,
  activeView,
  busy = false,
  onViewChange,
  onOpenConsultation,
  onStartConsultation,
  onUpdateItemState,
  onMutateCollection,
  onCreateWearLog,
  onDeleteWearLog,
  onCreateShare,
  onRevokeShare,
  onStartFromReference,
}: NativeStylebookCollectionProps) {
  const [query, setQuery] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [sort, setSort] = useState<"recent" | "confirmed" | "favorite" | "satisfaction">("recent");
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [collectionNameDraft, setCollectionNameDraft] = useState("");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<CustomerStylebookEntryV2 | null>(null);
  const [entryModal, setEntryModal] = useState<EntryModal>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [appliedOn, setAppliedOn] = useState(new Date().toISOString().slice(0, 10));
  const [applicationType, setApplicationType] = useState<CustomerStylebookWearLogRequestV2["applicationType"]>("other");
  const [satisfaction, setSatisfaction] = useState(4);
  const [convenience, setConvenience] = useState(4);
  const [reactionNote, setReactionNote] = useState("");
  const [wearNote, setWearNote] = useState("");
  const [wouldRepeat, setWouldRepeat] = useState(true);
  const [photo, setPhoto] = useState<PhotoFile | null>(null);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [shareHours, setShareHours] = useState<24 | 168 | 720>(168);
  const [shareNote, setShareNote] = useState(false);
  const [sharePhoto, setSharePhoto] = useState(false);

  const entries = useMemo(() => activeView === "sets" ? [] : filterCustomerStylebookEntriesV2(collection, activeView, {
    query,
    favoriteOnly,
    includeArchived,
    collectionId,
    sort,
  }), [activeView, collection, collectionId, favoriteOnly, includeArchived, query, sort]);
  const allEntries = useMemo(() => [...collection.hair, ...collection.fashion], [collection]);
  const comparedEntries = allEntries.filter((entry) => compareIds.includes(`${entry.kind}:${entry.id}`));

  function openEntryModal(entry: CustomerStylebookEntryV2, modal: Exclude<EntryModal, null>) {
    setSelectedEntry(entry);
    setEntryModal(modal);
    setCustomTitle(entry.state.customTitle ?? "");
    setNote(entry.state.note);
    setTags(entry.state.tags.join(", "));
    setApplicationType(entry.kind === "hair" ? "hair_service" : "outfit_worn");
  }

  function closeEntryModal() {
    setEntryModal(null);
    setSelectedEntry(null);
    setPhoto(null);
    setPhotoConsent(false);
  }

  function toggleCompare(entry: CustomerStylebookEntryV2) {
    const key = `${entry.kind}:${entry.id}`;
    setCompareIds((current) => current.includes(key)
      ? current.filter((value) => value !== key)
      : current.length < 3 ? [...current, key] : [...current.slice(1), key]);
  }

  async function pickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync().catch(() => null);
    if (!permission?.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.82,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPhoto({ uri: asset.uri, name: asset.fileName ?? `stylebook-${Date.now()}.jpg`, type: asset.mimeType ?? "image/jpeg" });
  }

  async function saveManage() {
    if (!selectedEntry) return;
    await onUpdateItemState({
      kind: selectedEntry.kind,
      itemId: selectedEntry.id,
      customTitle: customTitle.trim() || null,
      note: note.trim(),
      tags: tags.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 12),
    });
    closeEntryModal();
  }

  async function saveWearLog() {
    if (!selectedEntry) return;
    await onCreateWearLog({
      item: itemRef(selectedEntry),
      appliedOn,
      applicationType,
      satisfaction,
      convenience,
      reactionNote: reactionNote.trim(),
      note: wearNote.trim(),
      wouldRepeat,
    }, photo, Boolean(photo && photoConsent));
    setReactionNote("");
    setWearNote("");
    closeEntryModal();
  }

  async function createShare() {
    if (!selectedEntry) return;
    const url = await onCreateShare({
      item: itemRef(selectedEntry),
      hours: shareHours,
      includePrivateNote: shareNote,
      includeActualPhoto: sharePhoto,
    });
    if (!url) return;
    await Share.share({ title: customerStylebookDisplayTitleV2(selectedEntry), message: `HairFit 스타일북 공유\n${url}`, url });
    closeEntryModal();
  }

  const selectedLogs = selectedEntry ? collection.wearLogs.filter((log) => log.item.kind === selectedEntry.kind && log.item.id === selectedEntry.id) : [];
  const selectedShares = selectedEntry ? collection.activeShares.filter((share) => share.item.kind === selectedEntry.kind && share.item.id === selectedEntry.id) : [];

  return (
    <View style={styles.collection}>
      {!collection.metadataAvailable ? <View style={styles.notice}><Text style={styles.noticeText}>기본 결과는 표시 중이지만 관리 데이터 저장소 연결을 확인해 주세요.</Text></View> : null}

      <View accessibilityRole="tablist" style={styles.tabs}>
        {([
          ["hair", "헤어", collection.hair.length],
          ["fashion", "패션", collection.fashion.length],
          ["sets", "토털 세트", collection.sets.length],
        ] as const).map(([view, label, count]) => {
          const selected = activeView === view;
          return (
            <Pressable key={view} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onViewChange(view)} style={({ pressed }) => [styles.tab, selected ? styles.tabSelected : null, pressed ? styles.pressed : null]}>
              <Text style={[styles.tabLabel, selected ? styles.tabLabelSelected : null]}>{label}</Text>
              <Text style={[styles.tabCount, selected ? styles.tabCountSelected : null]}>{count}</Text>
            </Pressable>
          );
        })}
      </View>

      {activeView !== "sets" ? (
        <CustomerCard style={styles.toolbar}>
          <TextInput accessibilityLabel="스타일북 검색" onChangeText={setQuery} placeholder="이름, 태그, 실루엣, 관리 난이도 검색" placeholderTextColor={customerColors.subtle} style={styles.input} value={query} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionRow}>
            <SmallButton active={favoriteOnly} onPress={() => setFavoriteOnly((value) => !value)}>즐겨찾기만</SmallButton>
            <SmallButton active={includeArchived} onPress={() => setIncludeArchived((value) => !value)}>보관함 포함</SmallButton>
            {(["recent", "confirmed", "favorite", "satisfaction"] as const).map((value) => (
              <SmallButton key={value} active={sort === value} onPress={() => setSort(value)}>{{ recent: "최근 수정", confirmed: "최신 확정", favorite: "즐겨찾기", satisfaction: "만족도" }[value]}</SmallButton>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionRow}>
            <SmallButton active={!collectionId} onPress={() => setCollectionId(null)}>전체 컬렉션</SmallButton>
            {collection.collections.map((item) => <SmallButton key={item.id} active={collectionId === item.id} onPress={() => { setCollectionId(item.id); setCollectionNameDraft(item.name); }}>{item.name}</SmallButton>)}
          </ScrollView>
          <View style={styles.inlineForm}>
            <TextInput accessibilityLabel="새 컬렉션 이름" onChangeText={setNewCollectionName} placeholder="새 컬렉션" placeholderTextColor={customerColors.subtle} style={[styles.input, styles.inlineInput]} value={newCollectionName} />
            <SmallButton disabled={busy || !newCollectionName.trim()} onPress={() => void onMutateCollection({ action: "create_collection", name: newCollectionName.trim(), colorKey: "champagne" }).then(() => setNewCollectionName(""))}>추가</SmallButton>
          </View>
          {collectionId ? (
            <View style={styles.inlineForm}>
              <TextInput accessibilityLabel="컬렉션 이름 변경" onChangeText={setCollectionNameDraft} placeholder="컬렉션 이름" placeholderTextColor={customerColors.subtle} style={[styles.input, styles.inlineInput]} value={collectionNameDraft} />
              <SmallButton disabled={busy || !collectionNameDraft.trim()} onPress={() => void onMutateCollection({ action: "update_collection", collectionId, name: collectionNameDraft.trim(), colorKey: collection.collections.find((item) => item.id === collectionId)?.colorKey ?? "champagne" })}>이름 저장</SmallButton>
              <SmallButton disabled={busy} onPress={() => void onMutateCollection({ action: "delete_collection", collectionId }).then(() => { setCollectionId(null); setCollectionNameDraft(""); })}>삭제</SmallButton>
            </View>
          ) : null}
          <View style={styles.compareBar}>
            <Text style={styles.compareText}>비교 {compareIds.length}/3 · 2개 이상 선택</Text>
            <SmallButton disabled={compareIds.length < 2} onPress={() => setCompareOpen(true)}>선택 비교</SmallButton>
          </View>
        </CustomerCard>
      ) : null}

      {activeView === "sets" ? collection.sets.map((set) => {
        const hair = collection.hair.find((entry) => entry.id === set.hairEntryId);
        const fashion = collection.fashion.find((entry) => entry.id === set.fashionEntryId);
        return (
          <CustomerCard key={set.id} style={styles.setCard}>
            <CustomerKicker>Total style set</CustomerKicker>
            <CustomerHeading compact>{set.title}</CustomerHeading>
            <CustomerBody>{set.mood} · 같은 컨설팅에서 확정한 헤어와 패션 조합</CustomerBody>
            <View style={styles.setPreviewRow}>
              {hair ? <View style={styles.setPreview}><EntryPreview entry={hair} /><Text style={styles.setLabel}>{customerStylebookDisplayTitleV2(hair)}</Text></View> : null}
              {fashion ? <View style={styles.setPreview}><EntryPreview entry={fashion} /><Text style={styles.setLabel}>{customerStylebookDisplayTitleV2(fashion)}</Text></View> : null}
            </View>
            <SmallButton onPress={() => onOpenConsultation(set.consultationId)}>통합 최종 결과 보기</SmallButton>
          </CustomerCard>
        );
      }) : entries.map((entry) => (
        <EntryCard
          key={`${entry.kind}:${entry.id}`}
          collection={collection}
          entry={entry}
          compareSelected={compareIds.includes(`${entry.kind}:${entry.id}`)}
          busy={busy}
          onOpen={() => onOpenConsultation(entry.consultationId)}
          onFavorite={() => void onUpdateItemState({ kind: entry.kind, itemId: entry.id, favorite: !entry.state.favorite })}
          onCompare={() => toggleCompare(entry)}
          onModal={(modal) => openEntryModal(entry, modal)}
          onStartFromReference={() => void onStartFromReference(itemRef(entry))}
        />
      ))}

      {(activeView === "sets" ? collection.sets.length === 0 : entries.length === 0) ? (
        <CustomerCard style={styles.emptyCard}>
          <CustomerKicker>Your collection</CustomerKicker>
          <CustomerHeading compact>{query || favoriteOnly || collectionId ? "조건에 맞는 스타일이 없어요" : "첫 스타일을 만들어 볼까요?"}</CustomerHeading>
          <CustomerBody>컨설팅 마지막 단계에서 확정한 결과가 이곳에 자동으로 연결됩니다.</CustomerBody>
          <Pressable accessibilityRole="button" onPress={onStartConsultation} style={styles.emptyAction}><Text style={styles.emptyActionLabel}>컨설팅 시작</Text></Pressable>
        </CustomerCard>
      ) : null}

      <Modal animationType="slide" onRequestClose={closeEntryModal} transparent visible={Boolean(selectedEntry && entryModal)}>
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleGroup}>
                <CustomerKicker>{entryModal === "manage" ? "Organize" : entryModal === "wear" ? "Real life log" : "Private share"}</CustomerKicker>
                <CustomerHeading compact>{selectedEntry ? customerStylebookDisplayTitleV2(selectedEntry) : "스타일 관리"}</CustomerHeading>
              </View>
              <SmallButton onPress={closeEntryModal}>닫기</SmallButton>
            </View>

            {entryModal === "manage" && selectedEntry ? (
              <View style={styles.formStack}>
                <Text style={styles.fieldLabel}>내가 부를 이름</Text>
                <TextInput accessibilityLabel="사용자 지정 제목" onChangeText={setCustomTitle} placeholder="기본 제목 사용" placeholderTextColor={customerColors.subtle} style={styles.input} value={customTitle} />
                <Text style={styles.fieldLabel}>메모</Text>
                <TextInput accessibilityLabel="개인 메모" multiline onChangeText={setNote} placeholder="살롱 전달 포인트, 코디 팁" placeholderTextColor={customerColors.subtle} style={[styles.input, styles.textArea]} value={note} />
                <Text style={styles.fieldLabel}>태그 · 쉼표로 구분</Text>
                <TextInput accessibilityLabel="태그" onChangeText={setTags} placeholder="출근, 가을, 손질 쉬움" placeholderTextColor={customerColors.subtle} style={styles.input} value={tags} />
                <Text style={styles.fieldLabel}>컬렉션</Text>
                <View style={styles.actionRow}>
                  {collection.collections.map((item) => {
                    const included = item.itemRefs.some((ref) => ref.kind === selectedEntry.kind && ref.id === selectedEntry.id);
                    return <SmallButton key={item.id} active={included} disabled={busy} onPress={() => void onMutateCollection({ action: "set_collection_item", collectionId: item.id, item: itemRef(selectedEntry), included: !included })}>{item.name}</SmallButton>;
                  })}
                </View>
                <View style={styles.actionRow}>
                  <SmallButton disabled={busy} onPress={() => void onUpdateItemState({ kind: selectedEntry.kind, itemId: selectedEntry.id, archived: !selectedEntry.state.archivedAt }).then(closeEntryModal)}>{selectedEntry.state.archivedAt ? "보관함에서 꺼내기" : "보관하기"}</SmallButton>
                  <SmallButton disabled={busy} onPress={() => void saveManage()}>저장</SmallButton>
                </View>
              </View>
            ) : null}

            {entryModal === "wear" && selectedEntry ? (
              <View style={styles.formStack}>
                <Text style={styles.fieldLabel}>실제로 적용한 날짜</Text>
                <TextInput accessibilityLabel="적용 날짜" onChangeText={setAppliedOn} placeholder="YYYY-MM-DD" placeholderTextColor={customerColors.subtle} style={styles.input} value={appliedOn} />
                <View style={styles.actionRow}>
                  {(["hair_service", "outfit_worn", "other"] as const).map((value) => <SmallButton key={value} active={applicationType === value} onPress={() => setApplicationType(value)}>{{ hair_service: "헤어 시술", outfit_worn: "착장", other: "기타" }[value]}</SmallButton>)}
                </View>
                <RatingInput label="결과 만족도" value={satisfaction} onChange={setSatisfaction} />
                <RatingInput label="일상 편의성" value={convenience} onChange={setConvenience} />
                <TextInput accessibilityLabel="주변 반응" onChangeText={setReactionNote} placeholder="주변 반응" placeholderTextColor={customerColors.subtle} style={styles.input} value={reactionNote} />
                <TextInput accessibilityLabel="실제 사용 메모" multiline onChangeText={setWearNote} placeholder="유지력, 불편했던 점, 다음에 바꿀 점" placeholderTextColor={customerColors.subtle} style={[styles.input, styles.textArea]} value={wearNote} />
                <View style={styles.actionRow}>
                  <SmallButton active={wouldRepeat} onPress={() => setWouldRepeat(true)}>다시 선택</SmallButton>
                  <SmallButton active={!wouldRepeat} onPress={() => setWouldRepeat(false)}>다른 방향</SmallButton>
                </View>
                <SmallButton onPress={() => void pickPhoto()}>{photo ? "사진 다시 선택" : "실제 사진 선택"}</SmallButton>
                {photo ? <SmallButton active={photoConsent} onPress={() => setPhotoConsent((value) => !value)}>사진 비공개 저장 동의</SmallButton> : null}
                {photo && !photoConsent ? <Text style={styles.privacyText}>동의하지 않으면 사진은 업로드하지 않고 텍스트 기록만 저장합니다.</Text> : null}
                <SmallButton disabled={busy} onPress={() => void saveWearLog()}>실제 기록 저장</SmallButton>
                {selectedLogs.map((log) => (
                  <View key={log.id} style={styles.historyRow}>
                    <View style={styles.historyCopy}><Text style={styles.historyTitle}>{formatDate(log.appliedOn)} · 만족 {log.satisfaction}/5</Text><Text style={styles.historyBody}>{log.note || log.reactionNote || "메모 없음"}</Text></View>
                    <SmallButton disabled={busy} onPress={() => void onDeleteWearLog(log.id)}>삭제</SmallButton>
                  </View>
                ))}
              </View>
            ) : null}

            {entryModal === "share" && selectedEntry ? (
              <View style={styles.formStack}>
                <CustomerBody>공유 링크는 만료되며 언제든 취소할 수 있습니다. 개인 메모와 실제 사진은 기본 제외입니다.</CustomerBody>
                <View style={styles.actionRow}>
                  {([24, 168, 720] as const).map((hours) => <SmallButton key={hours} active={shareHours === hours} onPress={() => setShareHours(hours)}>{hours === 24 ? "24시간" : hours === 168 ? "7일" : "30일"}</SmallButton>)}
                </View>
                <SmallButton active={shareNote} onPress={() => setShareNote((value) => !value)}>개인 메모 포함</SmallButton>
                <SmallButton active={sharePhoto} onPress={() => setSharePhoto((value) => !value)}>실제 사진 포함</SmallButton>
                <SmallButton disabled={busy} onPress={() => void createShare()}>만료 링크 만들기·공유</SmallButton>
                <CustomerBody>링크를 브라우저에서 열면 인쇄 메뉴를 통해 PDF로 저장할 수 있습니다.</CustomerBody>
                {selectedShares.map((share) => (
                  <View key={share.id} style={styles.historyRow}>
                    <View style={styles.historyCopy}><Text style={styles.historyTitle}>{formatDate(share.expiresAt)} 만료</Text><Text style={styles.historyBody}>메모 {share.includePrivateNote ? "포함" : "제외"} · 실제 사진 {share.includeActualPhoto ? "포함" : "제외"}</Text></View>
                    <SmallButton disabled={busy} onPress={() => void onRevokeShare(share.id)}>취소</SmallButton>
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setCompareOpen(false)} transparent visible={compareOpen}>
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.modalCard}>
            <View style={styles.modalHeader}><CustomerHeading compact>선택 스타일 비교</CustomerHeading><SmallButton onPress={() => setCompareOpen(false)}>닫기</SmallButton></View>
            <View style={styles.compareGrid}>
              {comparedEntries.map((entry) => (
                <View key={`${entry.kind}:${entry.id}`} style={styles.compareItem}>
                  <EntryPreview entry={entry} />
                  <Text style={styles.compareTitle}>{customerStylebookDisplayTitleV2(entry)}</Text>
                  <Text style={styles.compareBody}>{entry.kind === "hair" ? `${entry.length} · ${entry.texture} · ${entry.maintenanceLevel}` : `${entry.silhouette} · ${entry.neckline}`}</Text>
                  <SmallButton onPress={() => onOpenConsultation(entry.consultationId)}>결과 보기</SmallButton>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  collection: { gap: 14 },
  tabs: { backgroundColor: customerColors.surface, borderColor: customerColors.line, borderRadius: 18, borderWidth: 1, flexDirection: "row", padding: 4 },
  tab: { alignItems: "center", borderRadius: 14, flex: 1, flexDirection: "row", gap: 5, justifyContent: "center", minHeight: 48, paddingHorizontal: 6 },
  tabSelected: { backgroundColor: customerColors.ivory },
  tabLabel: { color: customerColors.muted, fontSize: 12, fontWeight: "800" },
  tabLabelSelected: { color: customerColors.canvas },
  tabCount: { backgroundColor: customerColors.raised, borderRadius: 999, color: customerColors.muted, fontSize: 10, fontWeight: "800", minWidth: 20, overflow: "hidden", paddingHorizontal: 5, paddingVertical: 3, textAlign: "center" },
  tabCountSelected: { backgroundColor: customerColors.champagneSoft, color: customerColors.canvas },
  toolbar: { gap: 12 },
  input: { backgroundColor: customerColors.raised, borderColor: customerColors.line, borderRadius: 12, borderWidth: 1, color: customerColors.ivory, fontSize: 14, minHeight: 48, paddingHorizontal: 14, paddingVertical: 10 },
  textArea: { minHeight: 96, textAlignVertical: "top" },
  inlineForm: { alignItems: "center", flexDirection: "row", gap: 8 },
  inlineInput: { flex: 1 },
  compareBar: { alignItems: "center", borderTopColor: customerColors.line, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingTop: 10 },
  compareText: { color: customerColors.muted, fontSize: 12 },
  smallButton: { alignItems: "center", backgroundColor: customerColors.raised, borderColor: customerColors.line, borderRadius: 999, borderWidth: 1, justifyContent: "center", minHeight: 38, paddingHorizontal: 13, paddingVertical: 8 },
  smallButtonActive: { backgroundColor: customerColors.champagneSoft, borderColor: customerColors.lineStrong },
  smallButtonLabel: { color: customerColors.muted, fontSize: 12, fontWeight: "800" },
  smallButtonLabelActive: { color: customerColors.champagnePressed },
  card: { padding: 0 },
  preview: { aspectRatio: 4 / 5, backgroundColor: customerColors.raised, overflow: "hidden", position: "relative" },
  previewImage: { height: "100%", resizeMode: "cover", width: "100%" },
  placeholder: { alignItems: "center", flex: 1, justifyContent: "center" },
  placeholderText: { color: customerColors.champagne, fontFamily: "serif", fontSize: 48, letterSpacing: -3 },
  favoriteBadge: { alignItems: "center", backgroundColor: "rgba(17,17,15,.86)", borderRadius: 999, height: 34, justifyContent: "center", position: "absolute", right: 12, top: 12, width: 34 },
  favoriteBadgeLabel: { color: customerColors.champagne, fontSize: 17 },
  archiveBadge: { backgroundColor: "rgba(17,17,15,.86)", borderRadius: 999, bottom: 12, paddingHorizontal: 10, paddingVertical: 5, position: "absolute", right: 12 },
  archiveBadgeLabel: { color: customerColors.muted, fontSize: 10, fontWeight: "800" },
  cardBody: { gap: 10, padding: 18 },
  metaRow: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between" },
  date: { color: customerColors.subtle, fontSize: 11 },
  tagLine: { color: customerColors.champagne, fontSize: 12, lineHeight: 18 },
  palette: { flexDirection: "row", gap: 7 },
  swatch: { borderColor: customerColors.line, borderRadius: 999, borderWidth: 1, height: 20, width: 20 },
  openAction: { borderTopColor: customerColors.line, borderTopWidth: 1, minHeight: 42, paddingTop: 12 },
  openLabel: { color: customerColors.champagne, fontSize: 13, fontWeight: "800" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  logSummary: { backgroundColor: customerColors.champagneSoft, borderRadius: 12, gap: 3, padding: 11 },
  logSummaryTitle: { color: customerColors.ivory, fontSize: 12, fontWeight: "800" },
  logSummaryBody: { color: customerColors.muted, fontSize: 11 },
  setCard: { gap: 12 },
  setPreviewRow: { flexDirection: "row", gap: 10 },
  setPreview: { flex: 1, gap: 7 },
  setLabel: { color: customerColors.ivory, fontSize: 12, fontWeight: "800" },
  emptyCard: { gap: 12, justifyContent: "center", minHeight: 260 },
  emptyAction: { alignItems: "center", backgroundColor: customerColors.champagne, borderRadius: 999, justifyContent: "center", minHeight: 50, paddingHorizontal: 20 },
  emptyActionLabel: { color: customerColors.canvas, fontSize: 14, fontWeight: "800" },
  notice: { backgroundColor: "#2a2114", borderColor: customerColors.lineStrong, borderRadius: 12, borderWidth: 1, padding: 12 },
  noticeText: { color: customerColors.champagnePressed, fontSize: 12, lineHeight: 18 },
  modalBackdrop: { backgroundColor: "rgba(0,0,0,.74)", flex: 1, justifyContent: "flex-end" },
  modalCard: { backgroundColor: customerColors.surface, borderColor: customerColors.line, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, gap: 18, maxHeight: "92%", padding: 20, paddingBottom: 42 },
  modalHeader: { alignItems: "flex-start", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  modalTitleGroup: { flex: 1, gap: 4 },
  formStack: { gap: 12 },
  fieldGroup: { gap: 8 },
  fieldLabel: { color: customerColors.ivory, fontSize: 12, fontWeight: "800" },
  privacyText: { color: customerColors.champagnePressed, fontSize: 11, lineHeight: 17 },
  historyRow: { alignItems: "center", borderTopColor: customerColors.line, borderTopWidth: 1, flexDirection: "row", gap: 10, justifyContent: "space-between", paddingTop: 12 },
  historyCopy: { flex: 1, gap: 3 },
  historyTitle: { color: customerColors.ivory, fontSize: 12, fontWeight: "800" },
  historyBody: { color: customerColors.muted, fontSize: 11, lineHeight: 17 },
  compareGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  compareItem: { backgroundColor: customerColors.raised, borderColor: customerColors.line, borderRadius: 14, borderWidth: 1, gap: 8, overflow: "hidden", paddingBottom: 10, width: "47%" },
  compareTitle: { color: customerColors.ivory, fontSize: 13, fontWeight: "800", paddingHorizontal: 10 },
  compareBody: { color: customerColors.muted, fontSize: 11, lineHeight: 17, paddingHorizontal: 10 },
  pressed: { opacity: 0.86 },
  disabled: { opacity: 0.45 },
});
