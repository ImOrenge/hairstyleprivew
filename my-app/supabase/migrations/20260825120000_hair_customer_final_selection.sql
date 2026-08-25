-- Preserve the customer's final choice independently from the AI ranking.
alter table public.consultation_hair_recommendations_v2
  add column if not exists confirmed_preview_id uuid references public.preview_variants_v2(id) on delete restrict,
  add column if not exists confirmed_rank integer,
  add column if not exists selection_source text;

update public.consultation_hair_recommendations_v2
set confirmed_preview_id = primary_preview_id,
    confirmed_rank = coalesce((
      select (item ->> 'rank')::integer
      from jsonb_array_elements(consultation_hair_recommendations_v2.ranked_previews) item
      where item ->> 'previewId' = consultation_hair_recommendations_v2.primary_preview_id::text
      limit 1
    ), 1),
    selection_source = 'ai_primary'
where state = 'confirmed'
  and confirmed_preview_id is null;

do $migration$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.consultation_hair_recommendations_v2'::regclass
      and conname = 'consultation_hair_recommendations_v2_confirmed_rank_check'
  ) then
    alter table public.consultation_hair_recommendations_v2
      add constraint consultation_hair_recommendations_v2_confirmed_rank_check
      check (confirmed_rank is null or confirmed_rank between 1 and 9);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.consultation_hair_recommendations_v2'::regclass
      and conname = 'consultation_hair_recommendations_v2_selection_source_check'
  ) then
    alter table public.consultation_hair_recommendations_v2
      add constraint consultation_hair_recommendations_v2_selection_source_check
      check (selection_source is null or selection_source in ('ai_primary', 'customer_choice'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.consultation_hair_recommendations_v2'::regclass
      and conname in (
        'consultation_hair_recommendations_v2_confirmed_choice_check',
        'consultation_hair_recommendations_v2_confirmed_selection_check'
      )
  ) then
    alter table public.consultation_hair_recommendations_v2
      add constraint consultation_hair_recommendations_v2_confirmed_selection_check
      check (
        (state = 'confirmed' and confirmed_preview_id is not null and confirmed_rank is not null and selection_source is not null)
        or
        (state <> 'confirmed' and confirmed_preview_id is null and confirmed_rank is null and selection_source is null)
      );
  end if;
end
$migration$;

revoke all on table public.consultation_hair_recommendations_v2 from public, anon, authenticated;
grant select, insert, update, delete on table public.consultation_hair_recommendations_v2 to service_role;

comment on column public.consultation_hair_recommendations_v2.confirmed_preview_id is
  'Quality-passed preview explicitly confirmed by the customer.';
comment on column public.consultation_hair_recommendations_v2.selection_source is
  'Whether the customer kept the AI primary or chose another eligible preview.';
