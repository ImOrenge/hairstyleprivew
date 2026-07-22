import type { PersonalColorResult } from "../../lib/fashion-types";
import type { MemberStyleTarget, MemberStyleTone } from "../../lib/onboarding";
import type { SubscriptionAccessMode } from "../../lib/subscription-access";

export type MyPageTabId =
  | "usage"
  | "plan"
  | "aftercare"
  | "personal-color"
  | "body-profile"
  | "account";

export interface UserProfileRow {
  credits?: number | null;
  display_name?: string | null;
}

export interface PaymentTransactionRow {
  id: string;
  status: string | null;
  amount: number | null;
  credits_to_grant: number | null;
  paid_at: string | null;
  created_at: string;
  failure_code?: string | null;
  failure_message?: string | null;
  webhook_event_type?: string | null;
  webhook_received_at?: string | null;
  metadata?: unknown;
}

export interface RefundRequestRow {
  id: string;
  payment_transaction_id: string;
  status: string | null;
  refund_type: string | null;
  amount_krw: number | null;
  reason: string | null;
  requested_at: string;
  approved_at?: string | null;
  completed_at?: string | null;
  failed_code?: string | null;
  failed_message?: string | null;
}

export interface GenerationRow {
  id: string;
  created_at: string;
  prompt_used: string | null;
  status: string | null;
  credits_used: number | null;
}

export interface UserStyleProfileRow {
  height_cm?: number | null;
  body_shape?: string | null;
  top_size?: string | null;
  bottom_size?: string | null;
  fit_preference?: string | null;
  exposure_preference?: string | null;
  body_photo_path?: string | null;
}

export interface HairRecordRow {
  id: string;
  generation_id?: string | null;
  style_name: string | null;
  service_type: string | null;
  service_date: string | null;
  next_visit_target_days: number | null;
  selected_variant_id?: string | null;
  selected_variant_image_url?: string | null;
  created_at: string;
}

export interface SubscriptionRow {
  plan_key: string | null;
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end?: boolean | null;
  canceled_at?: string | null;
  has_stored_billing_key?: boolean | null;
  renewal_failure_count?: number | null;
  renewal_failure_code?: string | null;
  renewal_failure_message?: string | null;
  renewal_last_failed_at?: string | null;
  renewal_next_retry_at?: string | null;
}

export interface MemberProfileRow {
  display_name?: string | null;
  style_target?: MemberStyleTarget | null;
  preferred_style_tone?: MemberStyleTone | null;
}

export interface MyPageQueryState {
  checkoutId: string;
  payment: string;
  subscribed: string;
}

export interface MyPageDashboardTabsProps {
  accountSetupComplete: boolean;
  activeTab: MyPageTabId;
  email: string;
  generations: GenerationRow[];
  hairRecords: HairRecordRow[];
  payments: PaymentTransactionRow[];
  refundRequests: RefundRequestRow[];
  memberProfile: MemberProfileRow | null;
  personalColor: PersonalColorResult | null;
  profile: UserProfileRow | null;
  queryState: MyPageQueryState;
  subscription: SubscriptionRow | null;
  subscriptionAccessMode: SubscriptionAccessMode;
  viewerName: string;
}
