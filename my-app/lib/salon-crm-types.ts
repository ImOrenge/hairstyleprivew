export type SalonCustomerSource = "manual" | "linked_member";
export type SalonAftercareChannel = "sms" | "kakao" | "phone" | "manual";
export type SalonAftercareStatus = "pending" | "done" | "canceled";

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
