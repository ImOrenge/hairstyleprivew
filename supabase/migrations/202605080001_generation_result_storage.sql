-- Store generated hairstyle images outside generation JSON payloads.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('generation-results', 'generation-results', false, 16000000, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update
   set public = excluded.public,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

alter table public.generations
  add column if not exists generated_assets_expires_at timestamptz;

create index if not exists idx_generations_generated_assets_expires_at
  on public.generations(generated_assets_expires_at)
  where generated_assets_expires_at is not null;

create or replace function public.list_expired_generation_result_paths(
  p_cutoff timestamptz default now()
)
returns table (
  generation_id uuid,
  user_id text,
  generated_image_path text
)
language sql
security definer
set search_path = public
as $$
  select
    g.id,
    g.user_id,
    variant.value ->> 'generatedImagePath' as generated_image_path
  from public.generations g
  cross join lateral jsonb_array_elements(
    coalesce(g.options -> 'recommendationSet' -> 'variants', '[]'::jsonb)
  ) as variant(value)
  where g.generated_assets_expires_at is not null
    and g.generated_assets_expires_at <= p_cutoff
    and coalesce(variant.value ->> 'generatedImagePath', '') <> ''
    and variant.value ->> 'generatedImagePath' not like 'inline-output://%';
$$;

revoke all on function public.list_expired_generation_result_paths(timestamptz) from public;
grant execute on function public.list_expired_generation_result_paths(timestamptz) to service_role;
