-- Ensure only one running hairstyle catalog cycle exists per market.
-- Clean up duplicate running rows before enforcing the uniqueness guard.

with ranked_running_cycles as (
  select
    cycle_id,
    row_number() over (
      partition by market
      order by started_at desc, cycle_id desc
    ) as running_rank
  from public.hairstyle_catalog_cycles
  where status = 'running'
)
update public.hairstyle_catalog_cycles as cycles
   set status = 'failed',
       finished_at = coalesce(cycles.finished_at, timezone('utc', now())),
       error_log = coalesce(
         nullif(cycles.error_log, ''),
         'Marked failed while enforcing one running hairstyle catalog cycle per market.'
       )
  from ranked_running_cycles as ranked
 where cycles.cycle_id = ranked.cycle_id
   and ranked.running_rank > 1;

create unique index if not exists idx_hairstyle_catalog_cycles_one_running_per_market
  on public.hairstyle_catalog_cycles (market)
  where status = 'running';
