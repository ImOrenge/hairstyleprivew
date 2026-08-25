export interface AdminEntitlementSummary {
  activeGrantCount: number;
  remainingSessions: number;
  nearestExpiryAt: string | null;
}

export interface AdminEntitlementGrantRecord {
  id: string;
  user_id: string;
  offering_key: string;
  offering_version: number;
  quantity_granted: number;
  quantity_consumed: number;
  status: "active" | "exhausted" | "expired" | "revoked";
  source: "portone" | "google_play" | "apple_iap" | "manual" | "legacy_credit_bridge" | "promotion";
  valid_from: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminOfferingRecord {
  offering_key: string;
  version: number;
  customer_name: string | null;
  description: string;
  purchase_mode: "one_time" | "recurring";
  billing_interval: "month" | "quarter" | "year" | null;
  status: "draft" | "active" | "retired";
  included_consultation_sessions: number;
}

function isEffective(grant: AdminEntitlementGrantRecord, now: Date) {
  return grant.status === "active" &&
    new Date(grant.valid_from).getTime() <= now.getTime() &&
    (!grant.expires_at || new Date(grant.expires_at).getTime() > now.getTime()) &&
    grant.quantity_consumed < grant.quantity_granted;
}

export function summarizeAdminEntitlements(
  grants: AdminEntitlementGrantRecord[],
  now = new Date(),
): AdminEntitlementSummary {
  const active = grants.filter((grant) => isEffective(grant, now));
  const expiries = active
    .map((grant) => grant.expires_at)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(left).getTime() - new Date(right).getTime());

  return {
    activeGrantCount: active.length,
    remainingSessions: active.reduce(
      (total, grant) => total + Math.max(0, grant.quantity_granted - grant.quantity_consumed),
      0,
    ),
    nearestExpiryAt: expiries[0] ?? null,
  };
}

export function buildAdminEntitlementView(
  grant: AdminEntitlementGrantRecord,
  offering: AdminOfferingRecord | undefined,
  linkedToActiveConsultation: boolean,
  now = new Date(),
) {
  const remainingSessions = Math.max(0, grant.quantity_granted - grant.quantity_consumed);
  const expired = Boolean(grant.expires_at && new Date(grant.expires_at).getTime() <= now.getTime());
  const effectiveStatus = expired && grant.status === "active"
    ? "expired"
    : remainingSessions === 0 && grant.status === "active"
      ? "exhausted"
      : grant.status;

  let revocationBlockedReason: string | null = null;
  if (grant.source !== "manual") revocationBlockedReason = "수동 지급 이용권만 회수할 수 있습니다.";
  else if (grant.status !== "active") revocationBlockedReason = "활성 상태의 이용권만 회수할 수 있습니다.";
  else if (expired) revocationBlockedReason = "이미 만료된 이용권은 회수할 수 없습니다.";
  else if (grant.quantity_consumed !== 0) revocationBlockedReason = "사용 이력이 있는 이용권은 회수할 수 없습니다.";
  else if (linkedToActiveConsultation) revocationBlockedReason = "진행 중인 상담에 연결된 이용권은 회수할 수 없습니다.";

  return {
    id: grant.id,
    userId: grant.user_id,
    offeringKey: grant.offering_key,
    offeringVersion: grant.offering_version,
    customerName: offering?.customer_name || grant.offering_key,
    description: offering?.description || "",
    quantityGranted: grant.quantity_granted,
    quantityConsumed: grant.quantity_consumed,
    remainingSessions,
    status: grant.status,
    effectiveStatus,
    source: grant.source,
    validFrom: grant.valid_from,
    expiresAt: grant.expires_at,
    createdAt: grant.created_at,
    updatedAt: grant.updated_at,
    revocable: revocationBlockedReason === null,
    revocationBlockedReason,
  };
}

export function buildGrantableOfferings(offerings: AdminOfferingRecord[]) {
  const latestActive = new Map<string, AdminOfferingRecord>();
  for (const offering of offerings) {
    if (offering.status !== "active" || !offering.offering_key.startsWith("full_style_")) continue;
    const current = latestActive.get(offering.offering_key);
    if (!current || offering.version > current.version) latestActive.set(offering.offering_key, offering);
  }

  return [...latestActive.values()]
    .sort((left, right) => left.offering_key.localeCompare(right.offering_key))
    .map((offering) => ({
      key: offering.offering_key,
      version: offering.version,
      customerName: offering.customer_name || offering.offering_key,
      description: offering.description,
      purchaseMode: offering.purchase_mode,
      billingInterval: offering.billing_interval,
      includedSessions: offering.included_consultation_sessions,
      validityLabel: offering.purchase_mode === "one_time"
        ? "무기한"
        : offering.billing_interval === "quarter"
          ? "지급일로부터 3개월"
          : offering.billing_interval === "year"
            ? "지급일로부터 1년"
            : "서버 정책에 따름",
    }));
}
