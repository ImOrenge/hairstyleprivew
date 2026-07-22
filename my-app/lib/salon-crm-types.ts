export type SalonCustomerSource = "manual" | "linked_member";
export type SalonAftercareChannel = "sms" | "kakao" | "phone" | "manual";
export type SalonAftercareStatus = "pending" | "done" | "canceled";
export type SalonMatchStatus = "pending" | "linked" | "revoked";
export type SalonCustomerStyleTarget = "male" | "female";
export type SalonServiceType = "perm" | "color" | "cut" | "bleach" | "treatment" | "other";

export interface SalonCustomer {
  id: string;
  linkedUserId: string | null;
  source: SalonCustomerSource;
  name: string;
  phone: string;
  email: string;
  memo: string;
  consentSms: boolean;
  consentKakao: boolean;
  styleTarget: SalonCustomerStyleTarget | null;
  photoGenerationConsentAt: string | null;
  lastVisitAt: string | null;
  nextFollowUpAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isLinkedMember: boolean;
}

export interface SalonVisit {
  id: string;
  customerId: string;
  generationId: string | null;
  selectedVariantId: string | null;
  styleLabel: string | null;
  serviceType: SalonServiceType | null;
  designerBrief: Record<string, unknown> | null;
  visitedAt: string;
  serviceNote: string;
  memo: string;
  nextRecommendedVisitAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SalonAftercareTask {
  id: string;
  customerId: string;
  channel: SalonAftercareChannel;
  status: SalonAftercareStatus;
  scheduledFor: string;
  templateKey: string | null;
  note: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SalonMatchInvite {
  id: string;
  ownerUserId: string;
  code: string;
  active: boolean;
  consentVersion: string;
  expiresAt: string | null;
  supersededAt: string | null;
  supersededBy: string | null;
  createdAt: string;
  updatedAt: string;
  inviteUrl?: string;
}

export interface SalonMatchCandidate {
  id: string;
  ownerUserId: string;
  memberUserId: string;
  inviteId: string | null;
  status: SalonMatchStatus;
  linkedCustomerId: string | null;
  consentVersion: string | null;
  consentScope: Record<string, unknown> | null;
  consentedAt: string | null;
  linkedAt: string | null;
  revokedAt: string | null;
  revokedByUserId: string | null;
  revocationReason: string | null;
  createdAt: string;
  updatedAt: string;
  member: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface SalonLinkedMember {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface SalonMemberGenerationSummary {
  id: string;
  status: string;
  promptUsed: string | null;
  styleLabel: string | null;
  generatedImagePath: string | null;
  createdAt: string;
}

export interface SalonMemberHairRecordSummary {
  id: string;
  generationId: string | null;
  styleName: string;
  serviceType: string;
  serviceDate: string;
  createdAt: string;
}

export interface SalonConnectionSummary {
  id: string;
  ownerUserId: string;
  memberUserId: string;
  status: SalonMatchStatus;
  linkedCustomerId: string | null;
  consentVersion: string | null;
  consentScope: Record<string, unknown> | null;
  consentedAt: string | null;
  linkedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
