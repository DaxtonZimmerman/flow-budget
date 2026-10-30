-- Run only after deployment and after saving these two values in Supabase Vault:
-- flow_push_schedule_secret: same random secret as FLOW_PUSH_SCHEDULE_SECRET on the function
-- flow_push_delivery_url: the project's /functions/v1/flow-notification-delivery URL
-- No credentials belong in this file. No new paid provider is required.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$ begin
    if not exists(select 1 from vault.decrypted_secrets where name='flow_push_schedule_secret')
       or not exists(select 1 from vault.decrypted_secrets where name='flow_push_delivery_url') then
        raise exception 'Save notification schedule settings in Vault first';
    end if;
end $$;
select cron.unschedule(jobid) from cron.job where jobname='flow-reminders';
select cron.schedule('flow-reminders','5 * * * *',$job$
    select net.http_post(
        url:=(select decrypted_secret from vault.decrypted_secrets where name='flow_push_delivery_url' limit 1),
        headers:=jsonb_build_object('Content-Type','application/json','x-flow-schedule-secret',
            (select decrypted_secret from vault.decrypted_secrets where name='flow_push_schedule_secret' limit 1)),
        body:='{}'::jsonb,timeout_milliseconds:=30000
    );
$job$);
