import type {
  GenerationRow,
  MyPageQueryState,
  MyPageTabId,
} from "./myPageTypes";

const tabIds: MyPageTabId[] = [
  "usage",
  "plan",
  "aftercare",
  "personal-color",
  "body-profile",
  "account",
];

export function normalizeMyPageTab(
  value: string | null | undefined,
): MyPageTabId {
  return tabIds.includes(value as MyPageTabId)
    ? (value as MyPageTabId)
    : "usage";
}

export function buildMyPageTabHref(
  tab: MyPageTabId,
  queryState: MyPageQueryState,
) {
  const params = new URLSearchParams({ tab });
  if (queryState.payment) params.set("payment", queryState.payment);
  if (queryState.subscribed) params.set("subscribed", queryState.subscribed);
  if (queryState.checkoutId) params.set("checkout_id", queryState.checkoutId);
  return `/mypage?${params.toString()}`;
}

export function getMyPageGenerationHref(generation: GenerationRow) {
  return generation.status === "completed"
    ? `/result/${generation.id}`
    : `/generate/${generation.id}`;
}
