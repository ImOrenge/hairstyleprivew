import type { CustomerStylebookV2, CustomerStylebookViewV2 } from "@hairfit/shared";
import { Plus } from "lucide-react";
import Link from "next/link";
import { CustomerPageHeader, CustomerShell } from "../customer/CustomerShell";
import { CustomerStylebookWorkspace } from "../customer/stylebook/CustomerStylebookWorkspace";

const EMPTY_STATE = {
  customTitle: null,
  note: "",
  tags: [] as string[],
  favorite: false,
  archivedAt: null,
  updatedAt: null,
};

const FIXTURE_COLLECTION: CustomerStylebookV2 = {
  schemaVersion: "customer-stylebook-v2",
  hair: [
    {
      kind: "hair",
      id: "hair-fixture-1",
      consultationId: "consultation-fashion-1",
      previewVariantId: "preview-hair-1",
      title: "소프트 레이어드 보브",
      description: "얼굴선은 가볍게 감싸고 정수리 볼륨은 자연스럽게 살린 최종안",
      imageUrl: "/discovery/models/women-hairstyle/preview-03.webp",
      confirmedAt: "2026-08-24T08:30:00.000Z",
      strategyBucket: "soft-classic",
      length: "medium",
      bang: "see_through",
      texture: "wavy",
      volume: ["crown", "side"],
      maintenanceLevel: "low",
      state: { ...EMPTY_STATE, tags: ["관리 쉬움", "단발 후보"], favorite: true },
    },
    {
      kind: "hair",
      id: "hair-fixture-2",
      consultationId: "consultation-hair-2",
      previewVariantId: "preview-hair-2",
      title: "내추럴 미디엄 웨이브",
      description: "손질 부담을 줄이고 부드러운 인상을 유지하는 데일리 스타일",
      imageUrl: "/discovery/models/women-hairstyle/preview-02.webp",
      confirmedAt: "2026-08-12T11:00:00.000Z",
      strategyBucket: "natural",
      length: "medium",
      bang: "none",
      texture: "wavy",
      volume: ["crown"],
      maintenanceLevel: "medium_maintenance",
      state: { ...EMPTY_STATE },
    },
  ],
  fashion: [
    {
      kind: "fashion",
      id: "fashion-fixture-1",
      consultationId: "consultation-fashion-1",
      selectionSnapshotId: "selection-fashion-1",
      selectedStylingSessionId: "styling-fashion-1",
      title: "아이보리 모던 데일리",
      category: "DAILY",
      genre: "minimal",
      palette: ["#F4F1E8", "#34322C", "#A8863A"],
      silhouette: "릴랙스드 스트레이트",
      neckline: "소프트 V넥",
      items: [{ slot: "top", name: "아이보리 니트", color: "ivory", fit: "regular", material: "knit" }],
      shoppingKeywords: ["아이보리 니트", "차콜 와이드 팬츠"],
      imageUrl: "/discovery/models/women-hairstyle/preview-01.webp",
      confirmedAt: "2026-08-25T09:10:00.000Z",
      state: { ...EMPTY_STATE, tags: ["가을", "데이트"] },
    },
    {
      kind: "fashion",
      id: "fashion-fixture-2",
      consultationId: "consultation-fashion-2",
      selectionSnapshotId: "selection-fashion-2",
      selectedStylingSessionId: "styling-fashion-2",
      title: "샴페인 워크 룩",
      category: "WORK",
      genre: "classic",
      palette: ["#E8D9B8", "#1F1E1B", "#A8863A"],
      silhouette: "세미 테일러드",
      neckline: "보트넥",
      items: [{ slot: "outer", name: "그래파이트 재킷", color: "graphite", fit: "regular", material: "wool" }],
      shoppingKeywords: ["그래파이트 재킷"],
      imageUrl: null,
      confirmedAt: "2026-08-20T06:20:00.000Z",
      state: { ...EMPTY_STATE },
    },
    {
      kind: "fashion",
      id: "fashion-fixture-3",
      consultationId: "consultation-fashion-3",
      selectionSnapshotId: "selection-fashion-3",
      selectedStylingSessionId: "styling-fashion-3",
      title: "그래파이트 포인트 룩",
      category: "STATEMENT",
      genre: "street",
      palette: ["#151412", "#F4F1E8", "#B88B57"],
      silhouette: "크롭 앤 와이드",
      neckline: "크루넥",
      items: [{ slot: "bottom", name: "와이드 팬츠", color: "graphite", fit: "relaxed", material: "denim" }],
      shoppingKeywords: ["크롭 재킷", "와이드 팬츠"],
      imageUrl: "/discovery/models/women-hairstyle/preview-04.webp",
      confirmedAt: "2026-08-15T04:15:00.000Z",
      state: { ...EMPTY_STATE },
    },
  ],
  sets: [],
  collections: [
    {
      id: "collection-fixture-1",
      name: "가을 데이트",
      colorKey: "champagne",
      sortOrder: 0,
      itemRefs: [{ kind: "fashion", id: "fashion-fixture-1", consultationId: "consultation-fashion-1" }],
      createdAt: "2026-08-25T10:00:00.000Z",
      updatedAt: "2026-08-25T10:00:00.000Z",
    },
  ],
  wearLogs: [],
  activeShares: [],
  references: [],
  metadataAvailable: true,
};

FIXTURE_COLLECTION.sets = [{
  id: "set-fixture-1",
  consultationId: "consultation-fashion-1",
  hairEntryId: "hair-fixture-1",
  fashionEntryId: "fashion-fixture-1",
  title: "소프트 레이어드 보브 · 아이보리 모던 데일리",
  mood: "soft-classic · minimal",
  palette: ["#F4F1E8", "#34322C", "#A8863A"],
  confirmedAt: "2026-08-25T09:10:00.000Z",
}];

export function CustomerStylebookHarness({
  activeView,
  empty = false,
}: {
  activeView: CustomerStylebookViewV2;
  empty?: boolean;
}) {
  const collection = empty
    ? { ...FIXTURE_COLLECTION, [activeView]: [] }
    : FIXTURE_COLLECTION;

  return (
    <CustomerShell activePath="/stylebook">
      <div className="customer-page" data-e2e-customer-stylebook="true">
        <CustomerPageHeader
          eyebrow="Stylebook"
          title="나의 스타일북"
          description="최종 헤어·패션을 검색하고 비교해 컬렉션과 토털 세트로 정리하고, 실제 사용 기록까지 이어가세요."
          action={(
            <Link href="/consulting/new" className="customer-primary-button">
              <Plus aria-hidden="true" /> 새 컨설팅
            </Link>
          )}
        />
        <CustomerStylebookWorkspace
          initialCollection={collection}
          activeView={activeView}
          routeBase="/e2e-harness/customer-stylebook"
          memoryPersistence
        />
      </div>
    </CustomerShell>
  );
}
