-- Cover every foreign key reported by the database advisor. These indexes keep
-- parent updates/deletes and child lookups from falling back to table scans.
create index if not exists idx_aftercare_free_claims_generation_id
  on public.aftercare_free_claims (generation_id);

create index if not exists idx_aftercare_program_receipts_generation_id
  on public.aftercare_program_receipts (generation_id);

create index if not exists idx_fashion_catalog_source_cycle_id
  on public.fashion_catalog (source_cycle_id);

create index if not exists idx_hairstyle_catalog_active_cycles_active_cycle_id
  on public.hairstyle_catalog_active_cycles (active_cycle_id);

create index if not exists idx_hairstyle_catalog_active_cycles_last_rebuild_cycle_id
  on public.hairstyle_catalog_active_cycles (last_rebuild_cycle_id);

create index if not exists idx_hairstyle_catalog_active_cycles_previous_cycle_id
  on public.hairstyle_catalog_active_cycles (previous_cycle_id);

create index if not exists idx_hairstyle_catalog_lineups_catalog_item_id
  on public.hairstyle_catalog_lineups (catalog_item_id);

create index if not exists idx_payment_credit_clawbacks_ledger_id
  on public.payment_credit_clawbacks (ledger_id);

create index if not exists idx_payment_transactions_subscription_id
  on public.payment_transactions (subscription_id);

create index if not exists idx_salon_aftercare_tasks_customer_owner
  on public.salon_aftercare_tasks (customer_id, owner_user_id);

create index if not exists idx_salon_customer_visits_customer_owner
  on public.salon_customer_visits (customer_id, owner_user_id);

create index if not exists idx_salon_customers_linked_user_id
  on public.salon_customers (linked_user_id);

create index if not exists idx_salon_match_requests_invite_id
  on public.salon_match_requests (invite_id);

create index if not exists idx_salon_match_requests_linked_customer_id
  on public.salon_match_requests (linked_customer_id);

create index if not exists idx_styling_credit_attempts_generation_id
  on public.styling_credit_attempts (generation_id);

create index if not exists idx_support_faqs_created_by
  on public.support_faqs (created_by);

create index if not exists idx_support_faqs_updated_by
  on public.support_faqs (updated_by);

create index if not exists idx_support_posts_admin_answered_by
  on public.support_posts (admin_answered_by);

create index if not exists idx_support_posts_hidden_by
  on public.support_posts (hidden_by);

create index if not exists idx_trend_alert_deliveries_user_id
  on public.trend_alert_deliveries (user_id);

create index if not exists idx_user_care_contents_hair_record_id
  on public.user_care_contents (hair_record_id);

create index if not exists idx_user_hair_records_generation_id
  on public.user_hair_records (generation_id);
