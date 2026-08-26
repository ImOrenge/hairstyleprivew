import type {
  CustomerStylebookFashionEntryV2,
  CustomerStylebookHairEntryV2,
  CustomerStylebookItemKindV2,
  CustomerStylebookSortV2,
  CustomerStylebookV2,
  CustomerStylebookWearLogV2,
} from "./customer-stylebook.ts";

export type CustomerStylebookEntryV2 = CustomerStylebookHairEntryV2 | CustomerStylebookFashionEntryV2;

export interface CustomerStylebookFilterInputV2 {
  query?: string;
  favoriteOnly?: boolean;
  includeArchived?: boolean;
  collectionId?: string | null;
  facet?: string | null;
  sort?: CustomerStylebookSortV2;
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("ko-KR");
}

export function customerStylebookDisplayTitleV2(entry: CustomerStylebookEntryV2) {
  return entry.state.customTitle ?? entry.title;
}

export function customerStylebookFacetValuesV2(entry: CustomerStylebookEntryV2) {
  const common = [entry.kind, ...entry.state.tags];
  return entry.kind === "hair"
    ? [...common, entry.strategyBucket, entry.length, entry.bang, entry.texture, entry.maintenanceLevel, ...entry.volume]
    : [
        ...common,
        entry.category,
        entry.genre,
        entry.silhouette,
        entry.neckline,
        ...entry.palette,
        ...entry.items.flatMap((item) => [item.name, item.color, item.fit, item.material]),
        ...entry.shoppingKeywords,
      ];
}

export function customerStylebookSearchTextV2(entry: CustomerStylebookEntryV2) {
  const kindSpecific = entry.kind === "hair"
    ? [entry.description, entry.strategyBucket, entry.length, entry.bang, entry.texture, entry.maintenanceLevel, ...entry.volume]
    : [
        entry.genre,
        entry.silhouette,
        entry.neckline,
        ...entry.items.flatMap((item) => [item.name, item.color, item.fit, item.material]),
        ...entry.shoppingKeywords,
      ];
  return normalize([
    customerStylebookDisplayTitleV2(entry),
    entry.title,
    entry.state.note,
    ...entry.state.tags,
    ...kindSpecific,
  ].filter(Boolean).join(" "));
}

function satisfactionForEntry(entry: CustomerStylebookEntryV2, wearLogs: CustomerStylebookWearLogV2[]) {
  const values = wearLogs
    .filter((log) => log.item.kind === entry.kind && log.item.id === entry.id)
    .map((log) => log.satisfaction);
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : -1;
}

export function filterCustomerStylebookEntriesV2(
  collection: CustomerStylebookV2,
  kind: CustomerStylebookItemKindV2,
  input: CustomerStylebookFilterInputV2,
) {
  const query = normalize(input.query ?? "");
  const facet = normalize(input.facet ?? "");
  const collectionItems = input.collectionId
    ? new Set(collection.collections.find((value) => value.id === input.collectionId)?.itemRefs
      .filter((item) => item.kind === kind)
      .map((item) => item.id) ?? [])
    : null;
  const entries = collection[kind].filter((entry) => {
    if (!input.includeArchived && entry.state.archivedAt) return false;
    if (input.favoriteOnly && !entry.state.favorite) return false;
    if (collectionItems && !collectionItems.has(entry.id)) return false;
    if (query && !customerStylebookSearchTextV2(entry).includes(query)) return false;
    if (facet && !customerStylebookFacetValuesV2(entry).some((value) => normalize(value) === facet)) return false;
    return true;
  });

  return entries.sort((left, right) => {
    if (input.sort === "favorite") {
      const favorite = Number(right.state.favorite) - Number(left.state.favorite);
      if (favorite) return favorite;
    }
    if (input.sort === "satisfaction") {
      const satisfaction = satisfactionForEntry(right, collection.wearLogs) - satisfactionForEntry(left, collection.wearLogs);
      if (satisfaction) return satisfaction;
    }
    if (input.sort === "recent") {
      const leftUpdated = new Date(left.state.updatedAt ?? left.confirmedAt).getTime();
      const rightUpdated = new Date(right.state.updatedAt ?? right.confirmedAt).getTime();
      return rightUpdated - leftUpdated;
    }
    return new Date(right.confirmedAt).getTime() - new Date(left.confirmedAt).getTime();
  });
}
