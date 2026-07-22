-- Track customer email notifications sent after an admin posts an official support reply.

alter table public.support_posts
  add column if not exists admin_answer_email_sent_at timestamptz,
  add column if not exists admin_answer_email_provider_id text;

create index if not exists idx_support_posts_admin_answer_email_pending
  on public.support_posts (admin_answered_at)
  where admin_answer is not null
    and admin_answer_email_sent_at is null
    and deleted_at is null;
