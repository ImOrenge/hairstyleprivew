create unique index if not exists idx_user_hair_records_unique_generation_confirmation
  on public.user_hair_records (user_id, generation_id)
  where generation_id is not null;

create unique index if not exists idx_credit_ledger_unique_aftercare_program_usage
  on public.credit_ledger (generation_id, reason)
  where generation_id is not null
    and entry_type = 'usage'
    and reason = 'aftercare_program_usage';

alter table if exists public.generations
  alter column credits_used set default 10;

create or replace function public.consume_credits(
  p_user_id text,
  p_generation_id uuid,
  p_amount integer default 10,
  p_reason text default 'generation_usage',
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ledger_id bigint;
  v_auth_user_id text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'p_amount must be > 0';
  end if;

  begin
    v_auth_user_id := auth.jwt() ->> 'sub';
  exception
    when others then
      v_auth_user_id := null;
  end;

  if current_user = 'authenticated' and v_auth_user_id is distinct from p_user_id then
    raise exception 'forbidden: cannot consume credits for another user';
  end if;

  insert into public.credit_ledger (
    user_id,
    generation_id,
    entry_type,
    amount,
    balance_after,
    reason,
    metadata
  )
  values (
    p_user_id,
    p_generation_id,
    'usage',
    -1 * p_amount,
    0,
    p_reason,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_ledger_id;

  return v_ledger_id;
end;
$$;

revoke all on function public.consume_credits(text, uuid, integer, text, jsonb) from public;
revoke all on function public.consume_credits(text, uuid, integer, text, jsonb) from anon;
revoke all on function public.consume_credits(text, uuid, integer, text, jsonb) from authenticated;
grant execute on function public.consume_credits(text, uuid, integer, text, jsonb) to authenticated, service_role;

grant update, delete on public.user_hair_records to service_role;
