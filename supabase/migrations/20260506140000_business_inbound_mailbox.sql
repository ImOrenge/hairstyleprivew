alter table public.inbound_emails
  add column if not exists mailbox text not null default 'support';

alter table public.inbound_emails
  alter column mailbox set default 'support';

update public.inbound_emails
set mailbox = 'business'
where lower(envelope_to) = 'busyness@hairfit.beauty';

update public.inbound_emails
set mailbox = 'support'
where mailbox is null;

update public.inbound_emails
set mailbox = 'general'
where mailbox not in ('support', 'business', 'general');

alter table public.inbound_emails
  alter column mailbox set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inbound_emails_mailbox_check'
  ) then
    alter table public.inbound_emails
      add constraint inbound_emails_mailbox_check
      check (mailbox in ('support', 'business', 'general'));
  end if;
end
$$;

create index if not exists idx_inbound_emails_mailbox_status_received_at
  on public.inbound_emails (mailbox, status, received_at desc);
