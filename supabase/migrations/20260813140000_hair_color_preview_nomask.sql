-- P27 Color Studio uses the confirmed hairstyle image as its reference.
-- Legacy masks remain available for audit/recovery, but new AI recolor runs do not require one.

alter table if exists public.hair_color_generation_runs_v2
  alter column hair_mask_id drop not null;

comment on column public.hair_color_generation_runs_v2.hair_mask_id is
  'Optional legacy segmentation provenance. Null for reference-only AI hair-color previews.';
