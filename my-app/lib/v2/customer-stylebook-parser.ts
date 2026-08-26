import type { CustomerStylebookFashionEntryV2 } from "@hairfit/shared";

export type FashionPreviewSetRowV2 = {
  id: string;
  consultation_id: string;
  selection_snapshot_id: string;
  version: number;
  preview_set: unknown;
  created_at: string;
};

export type ParsedCustomerFashionSelectionV2 = Omit<CustomerStylebookFashionEntryV2, "imageUrl"> & {
  imagePath: string | null;
};

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => cleanString(item)).filter(Boolean)
    : [];
}

function emptyState(): CustomerStylebookFashionEntryV2["state"] {
  return {
    customTitle: null,
    note: "",
    tags: [],
    favorite: false,
    archivedAt: null,
    updatedAt: null,
  };
}

function parseFashionItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = objectOrNull(item);
    const slot = cleanString(record?.slot);
    const name = cleanString(record?.name);
    if (!slot || !name) return [];
    return [{
      slot,
      name,
      color: cleanString(record?.color),
      fit: cleanString(record?.fit),
      material: cleanString(record?.material),
    }];
  });
}

export function parseCustomerFashionPreviewSetRowV2(
  row: FashionPreviewSetRowV2,
): ParsedCustomerFashionSelectionV2 | null {
  const previewSet = objectOrNull(row.preview_set);
  if (previewSet?.schemaVersion !== "fashion-preview-set-v2") return null;
  const selectedLook = objectOrNull(previewSet.selectedLook);
  const category = cleanString(selectedLook?.category);
  const selectedStylingSessionId = cleanString(previewSet.selectedStylingSessionId);
  const consultationId = cleanString(row.consultation_id);
  const selectionSnapshotId = cleanString(row.selection_snapshot_id);
  const payloadConsultationId = cleanString(previewSet.consultationId);
  const payloadSelectionSnapshotId = cleanString(previewSet.selectionSnapshotId);
  const selectedHairSnapshotId = cleanString(previewSet.selectedHairSnapshotId);
  const confirmedAt = cleanString(row.created_at || previewSet.createdAt);
  if (
    !row.id
    || !consultationId
    || !selectionSnapshotId
    || !selectedStylingSessionId
    || !confirmedAt
    || !["DAILY", "WORK", "STATEMENT"].includes(category)
    || payloadConsultationId !== consultationId
    || payloadSelectionSnapshotId !== selectionSnapshotId
    || (selectedHairSnapshotId && selectedHairSnapshotId !== selectionSnapshotId)
  ) return null;

  return {
    kind: "fashion",
    id: row.id,
    consultationId,
    selectionSnapshotId,
    selectedStylingSessionId,
    title: cleanString(selectedLook?.label, "최종 패션 룩"),
    category: category as CustomerStylebookFashionEntryV2["category"],
    genre: cleanString(selectedLook?.genre, "personal style"),
    palette: stringArray(selectedLook?.palette),
    silhouette: cleanString(selectedLook?.silhouette, "맞춤 실루엣"),
    neckline: cleanString(selectedLook?.neckline, "추천 넥라인"),
    items: parseFashionItems(selectedLook?.items),
    shoppingKeywords: stringArray(selectedLook?.shoppingKeywords),
    imagePath: null,
    confirmedAt,
    state: emptyState(),
  };
}
