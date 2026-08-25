create index if not exists idx_consultation_hair_recommendations_v2_primary_preview
  on public.consultation_hair_recommendations_v2 (primary_preview_id)
  where primary_preview_id is not null;

create index if not exists idx_consultation_hair_recommendations_v2_confirmed_preview
  on public.consultation_hair_recommendations_v2 (confirmed_preview_id)
  where confirmed_preview_id is not null;;
