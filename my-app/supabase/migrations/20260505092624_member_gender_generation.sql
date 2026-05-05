update public.member_profiles
set style_target = null
where style_target = 'neutral';

alter table public.member_profiles
  alter column style_target drop not null;

alter table public.member_profiles
  drop constraint if exists member_profiles_style_target_gender_check;

alter table public.member_profiles
  add constraint member_profiles_style_target_gender_check
  check (
    style_target is null
    or style_target in ('male', 'female')
  );

alter table public.hairstyle_catalog
  add column if not exists style_targets public.member_style_target[] not null
  default array['male'::public.member_style_target, 'female'::public.member_style_target];

alter table public.hairstyle_catalog
  drop constraint if exists hairstyle_catalog_style_targets_gender_check;

alter table public.hairstyle_catalog
  add constraint hairstyle_catalog_style_targets_gender_check
  check (
    coalesce(array_length(style_targets, 1), 0) > 0
    and style_targets <@ array['male'::public.member_style_target, 'female'::public.member_style_target]
  );

create index if not exists idx_hairstyle_catalog_style_targets
  on public.hairstyle_catalog using gin (style_targets);

update public.hairstyle_catalog
set style_targets = case
  when slug in (
    'soft-pixie-temple-balance',
    'rounded-jawline-bob-frame',
    'see-through-hush-balance',
    'medium-c-curl-contour',
    'long-soft-lift-layer',
    'long-curtain-flow',
    'long-s-curl-frame',
    'tassel-bob-sharp-line'
  ) then array['female'::public.member_style_target]
  when slug in (
    'leaf-cut-back-flow',
    'guile-cut-side-volume'
  ) then array['male'::public.member_style_target]
  else array['male'::public.member_style_target, 'female'::public.member_style_target]
end;
