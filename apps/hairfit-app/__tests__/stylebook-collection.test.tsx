import type { CustomerStylebookV2 } from "@hairfit/shared";
import { fireEvent, render } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { NativeStylebookCollection } from "../components/customer/NativeStylebookCollection";

jest.mock("react-native-safe-area-context", () => {
  const ReactModule = jest.requireActual<typeof import("react")>("react");
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");

  return {
    SafeAreaView: ({ children, ...props }: { children: ReactNode }) =>
      ReactModule.createElement(View, props, children),
  };
});

const collection: CustomerStylebookV2 = {
  schemaVersion: "customer-stylebook-v2",
  hair: [{
    kind: "hair",
    id: "hair-1",
    consultationId: "consultation-hair",
    previewVariantId: "preview-1",
    title: "소프트 레이어드 보브",
    description: "확정한 헤어 방향",
    imageUrl: null,
    confirmedAt: "2026-08-25T09:00:00.000Z",
    strategyBucket: "balanced",
    length: "bob",
    bang: "soft",
    texture: "straight",
    volume: ["crown"],
    maintenanceLevel: "easy",
    state: { customTitle: null, note: "", tags: [], favorite: false, archivedAt: null, updatedAt: null },
  }],
  fashion: [{
    kind: "fashion",
    id: "fashion-1",
    consultationId: "consultation-fashion",
    selectionSnapshotId: "selection-1",
    selectedStylingSessionId: "styling-1",
    title: "아이보리 모던 데일리",
    category: "DAILY",
    genre: "minimal",
    palette: ["#F4F1E8", "#34322C"],
    silhouette: "릴랙스드 스트레이트",
    neckline: "소프트 V넥",
    items: [],
    shoppingKeywords: [],
    imageUrl: null,
    confirmedAt: "2026-08-25T09:00:00.000Z",
    state: { customTitle: null, note: "", tags: [], favorite: false, archivedAt: null, updatedAt: null },
  }],
  sets: [],
  collections: [],
  wearLogs: [],
  activeShares: [],
  references: [],
  metadataAvailable: true,
};

const actions = {
  onUpdateItemState: jest.fn(async () => undefined),
  onMutateCollection: jest.fn(async () => undefined),
  onCreateWearLog: jest.fn(async () => undefined),
  onDeleteWearLog: jest.fn(async () => undefined),
  onCreateShare: jest.fn(async () => "https://hairfit.beauty/stylebook/share/token"),
  onRevokeShare: jest.fn(async () => undefined),
  onStartFromReference: jest.fn(async () => undefined),
};

test("switches to final fashion looks and opens the owning consultation", async () => {
  const onViewChange = jest.fn();
  const onOpenConsultation = jest.fn();
  const view = await render(
    <NativeStylebookCollection
      collection={collection}
      activeView="hair"
      onViewChange={onViewChange}
      onOpenConsultation={onOpenConsultation}
      onStartConsultation={jest.fn()}
      {...actions}
    />,
  );

  await fireEvent.press(view.getByText("패션"));
  expect(onViewChange).toHaveBeenCalledWith("fashion");

  await view.rerender(
    <NativeStylebookCollection
      collection={collection}
      activeView="fashion"
      onViewChange={onViewChange}
      onOpenConsultation={onOpenConsultation}
      onStartConsultation={jest.fn()}
      {...actions}
    />,
  );
  await fireEvent.press(view.getByLabelText("아이보리 모던 데일리 패션 최종 리포트 열기"));
  expect(onOpenConsultation).toHaveBeenCalledWith("consultation-fashion");
  await view.unmount();
});

test("filters and starts a referenced consultation without skipping the consulting flow", async () => {
  const view = await render(
    <NativeStylebookCollection
      collection={collection}
      activeView="hair"
      onViewChange={jest.fn()}
      onOpenConsultation={jest.fn()}
      onStartConsultation={jest.fn()}
      {...actions}
    />,
  );

  await fireEvent.changeText(view.getByLabelText("스타일북 검색"), "레이어드");
  expect(view.getByText("소프트 레이어드 보브")).toBeTruthy();
  await fireEvent.press(view.getByText("참고해 새 컨설팅"));
  expect(actions.onStartFromReference).toHaveBeenCalledWith({
    kind: "hair",
    id: "hair-1",
    consultationId: "consultation-hair",
  });
  await view.unmount();
});
