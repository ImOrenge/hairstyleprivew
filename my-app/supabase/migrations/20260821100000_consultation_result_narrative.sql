-- Add grounded customer-facing consultation result narratives to the durable capability allow-list.
alter table public.hairfit_v2_engine_source_manifests
  drop constraint if exists hairfit_v2_engine_source_manifests_capability_check;
alter table public.hairfit_v2_engine_source_manifests
  add constraint hairfit_v2_engine_source_manifests_capability_check
  check (capability in (
    'hair-blueprint-recommendation', 'hair-preview-generation', 'personal-color-analysis',
    'salon-brief-generation', 'aftercare-program-generation', 'fashion-recommendation-generation',
    'makeup-semantic-map', 'makeup-rationale-generation', 'hair-trait-analysis',
    'makeup-simulation-generation', 'consultation-result-narrative-generation'
  ));
alter table public.consultation_capability_tasks_v2
  drop constraint if exists consultation_capability_tasks_v2_capability_check;
alter table public.consultation_capability_tasks_v2
  add constraint consultation_capability_tasks_v2_capability_check
  check (capability in (
    'hair-blueprint-recommendation', 'hair-preview-generation', 'personal-color-analysis',
    'salon-brief-generation', 'aftercare-program-generation', 'fashion-recommendation-generation',
    'makeup-semantic-map', 'makeup-rationale-generation', 'hair-trait-analysis',
    'makeup-simulation-generation', 'consultation-result-narrative-generation'
  ));
