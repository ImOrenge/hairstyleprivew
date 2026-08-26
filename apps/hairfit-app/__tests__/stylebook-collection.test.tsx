import type { CustomerStylebookV2 } from "@hairfit/shared";
import { fireEvent, render } from "@testing-library/react-native";
import { NativeStylebookCollection } from "../components/customer/NativeStylebookCollection";

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
  }],
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
    />,
  );

  await fireEvent.press(view.getByText("패션 룩"));
  expect(onViewChange).toHaveBeenCalledWith("fashion");

  await view.rerender(
    <NativeStylebookCollection
      collection={collection}
      activeView="fashion"
      onViewChange={onViewChange}
      onOpenConsultation={onOpenConsultation}
      onStartConsultation={jest.fn()}
    />,
  );
  expect(view.getByText("최종 확정")).toBeTruthy();
  await fireEvent.press(view.getByLabelText("아이보리 모던 데일리 패션 최종 리포트 열기"));
  expect(onOpenConsultation).toHaveBeenCalledWith("consultation-fashion");
});
