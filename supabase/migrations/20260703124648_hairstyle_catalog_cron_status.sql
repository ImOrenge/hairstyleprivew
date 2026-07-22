-- Read-only status helper for hairstyle catalog rotation cron registration.
-- Intended for service-role runtime smoke after the cron registration helper runs.

create or replace function public.get_hairstyle_catalog_rotation_cron_status()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job_table regclass := to_regclass('cron.job');
  v_jobs jsonb := '[]'::jsonb;
  v_missing_jobs jsonb := '[]'::jsonb;
  v_unhealthy_jobs jsonb := '[]'::jsonb;
  v_expected_job record;
  v_job jsonb;
begin
  if v_job_table is null then
    return jsonb_build_object(
      'ok', false,
      'available', false,
      'missingJobs', jsonb_build_array(
        'cron-hairstyle-catalog-rotation-check',
        'cron-trend-emails-post-rotation'
      ),
      'unhealthyJobs', '[]'::jsonb,
      'jobs', '[]'::jsonb
    );
  end if;

  execute $cron_jobs$
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'jobId', jobid,
          'jobName', jobname,
          'schedule', schedule,
          'active', active,
          'command', command
        )
        order by jobname
      ),
      '[]'::jsonb
    )
    from cron.job
    where jobname in (
      'cron-hairstyle-catalog-rotation-check',
      'cron-trend-emails-post-rotation'
    )
  $cron_jobs$
  into v_jobs;

  for v_expected_job in
    select *
    from (
      values
        (
          'cron-hairstyle-catalog-rotation-check',
          '20 0 * * *',
          '/api/admin/hairstyles/rebuild'
        ),
        (
          'cron-trend-emails-post-rotation',
          '40 0 * * *',
          '/cron-trend-emails'
        )
    ) as expected(job_name, expected_schedule, expected_command_fragment)
  loop
    select job.job_value
      into v_job
      from jsonb_array_elements(v_jobs) as job(job_value)
     where job.job_value->>'jobName' = v_expected_job.job_name
     limit 1;

    if v_job is null then
      v_missing_jobs := v_missing_jobs || jsonb_build_array(v_expected_job.job_name);
    elsif
      coalesce((v_job->>'active')::boolean, false) is not true
      or v_job->>'schedule' is distinct from v_expected_job.expected_schedule
      or position(v_expected_job.expected_command_fragment in coalesce(v_job->>'command', '')) = 0
    then
      v_unhealthy_jobs := v_unhealthy_jobs || jsonb_build_array(
        jsonb_build_object(
          'jobName', v_expected_job.job_name,
          'expectedSchedule', v_expected_job.expected_schedule,
          'expectedCommandFragment', v_expected_job.expected_command_fragment,
          'actualSchedule', v_job->>'schedule',
          'active', coalesce((v_job->>'active')::boolean, false),
          'commandMatches', position(v_expected_job.expected_command_fragment in coalesce(v_job->>'command', '')) > 0
        )
      );
    end if;

    v_job := null;
  end loop;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_missing_jobs) = 0 and jsonb_array_length(v_unhealthy_jobs) = 0,
    'available', true,
    'missingJobs', v_missing_jobs,
    'unhealthyJobs', v_unhealthy_jobs,
    'jobs', v_jobs
  );
end;
$$;

revoke all on function public.get_hairstyle_catalog_rotation_cron_status() from public;
grant execute on function public.get_hairstyle_catalog_rotation_cron_status() to service_role;
