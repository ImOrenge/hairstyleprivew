create table if not exists public.payment_refund_requests (
  id uuid primary key default gen_random_uuid(),
  payment_transaction_id uuid not null
    references public.payment_transactions(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  requested_by text not null,
  approved_by text,
  refund_type text not null default 'full'
    check (refund_type in ('full', 'partial')),
  amount_krw int
    check (amount_krw is null or amount_krw > 0),
  reason text not null,
  status text not null default 'pending'
    check (
      status in (
        'pending',
        'approved',
        'completed',
        'failed',
        'manual_review_required',
        'rejected'
      )
    ),
  portone_cancel_id text,
  requested_at timestamptz not null default timezone('utc', now()),
  approved_at timestamptz,
  completed_at timestamptz,
  failed_code text,
  failed_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint payment_refund_requests_full_amount_null
    check (refund_type <> 'full' or amount_krw is null)
);

create index if not exists idx_payment_refund_requests_user_requested_at
  on public.payment_refund_requests (user_id, requested_at desc);

create index if not exists idx_payment_refund_requests_status_requested_at
  on public.payment_refund_requests (status, requested_at desc);

create index if not exists idx_payment_refund_requests_payment_transaction_id
  on public.payment_refund_requests (payment_transaction_id);

create unique index if not exists idx_payment_refund_requests_one_open_per_payment
  on public.payment_refund_requests (payment_transaction_id)
  where status in ('pending', 'approved');

drop trigger if exists trg_payment_refund_requests_set_updated_at
  on public.payment_refund_requests;
create trigger trg_payment_refund_requests_set_updated_at
before update on public.payment_refund_requests
for each row execute function public.set_updated_at();

alter table public.payment_refund_requests enable row level security;
revoke all on table public.payment_refund_requests from anon, authenticated;
grant select, insert, update on table public.payment_refund_requests to service_role;
