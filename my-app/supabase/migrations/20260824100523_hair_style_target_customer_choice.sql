-- Freeze the profile style target per Hair 3x3 recommendation and persist the customer's final choice.
alter table public.consultation_hair_recommendations_v2
  add column if not exists style_target text,
  add column if not exists confirmed_preview_id uuid references public.preview_variants_v2(id) on delete restrict,
  add column if not exists confirmed_rank integer,
  add column if not exists selection_source text;

update public.consultation_hair_recommendations_v2 as recommendation
set style_target = (
  select attempt.prompt_input_snapshot ->> 'styleTarget' as style_target
  from public.preview_variants_v2 as variant
  join public.generation_attempts_v2 as attempt
    on attempt.id = variant.accepted_attempt_id
  where variant.board_id = recommendation.preview_board_id
  order by variant.slot asc
  limit 1
)
where recommendation.style_target is null
  and exists (
    select 1
    from public.preview_variants_v2 as variant
    join public.generation_attempts_v2 as attempt
      on attempt.id = variant.accepted_attempt_id
    where variant.board_id = recommendation.preview_board_id
      and attempt.prompt_input_snapshot ->> 'styleTarget' in ('male', 'female')
  );

update public.consultation_hair_recommendations_v2
set
  confirmed_preview_id = primary_preview_id,
  confirmed_rank = coalesce((
    select (ranked.item ->> 'rank')::integer
    from jsonb_array_elements(ranked_previews) as ranked(item)
    where ranked.item ->> 'previewId' = primary_preview_id::text
    limit 1
  ), 1),
  selection_source = 'ai_primary'
where state = 'confirmed'
  and confirmed_revision = revision
  and confirmed_preview_id is null;

alter table public.consultation_hair_recommendations_v2
  alter column style_target set not null;

do $$
begin
  alter table public.consultation_hair_recommendations_v2
    add constraint consultation_hair_recommendations_v2_style_target_check
    check (style_target in ('male', 'female'));
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.consultation_hair_recommendations_v2
    add constraint consultation_hair_recommendations_v2_confirmed_rank_check
    check (confirmed_rank is null or confirmed_rank between 1 and 9);
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.consultation_hair_recommendations_v2
    add constraint consultation_hair_recommendations_v2_selection_source_check
    check (selection_source is null or selection_source in ('ai_primary', 'customer_choice'));
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.consultation_hair_recommendations_v2
    add constraint consultation_hair_recommendations_v2_confirmed_choice_check
    check (
      (state = 'confirmed' and confirmed_preview_id is not null and confirmed_rank is not null and selection_source is not null)
      or
      (state <> 'confirmed' and confirmed_preview_id is null and confirmed_rank is null and selection_source is null)
    );
exception when duplicate_object then null;
end
$$;

comment on column public.consultation_hair_recommendations_v2.style_target is
  'Member profile style target frozen when the 3x3 generation batch starts.';
comment on column public.consultation_hair_recommendations_v2.confirmed_preview_id is
  'The quality-approved preview explicitly confirmed by the customer; it may differ from the AI primary.';
comment on column public.consultation_hair_recommendations_v2.selection_source is
  'Whether the final customer confirmation matched the AI primary or selected another approved preview.';;
