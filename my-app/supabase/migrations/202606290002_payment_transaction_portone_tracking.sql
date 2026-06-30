-- Add first-class PortOne operation fields to the payment ledger.
-- Metadata still keeps raw provider snapshots, but these columns make
-- reconciliation, webhook replay, and failure triage queryable.

alter table public.payment_transactions
  add column if not exists provider_transaction_id text,
  add column if not exists webhook_event_type text,
  add column if not exists webhook_received_at timestamptz,
  add column if not exists failure_code text,
  add column if not exists failure_message text;

create index if not exists idx_payment_transactions_provider_transaction_id
  on public.payment_transactions (provider, provider_transaction_id)
  where provider_transaction_id is not null;

create index if not exists idx_payment_transactions_webhook_received_at
  on public.payment_transactions (webhook_received_at desc)
  where webhook_received_at is not null;
