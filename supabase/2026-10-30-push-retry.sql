-- Only explicit provider rejection can release a claim. Unknown delivery stays
-- claimed so a lost reply cannot produce duplicate notifications.
alter table public.flow_push_deliveries add column if not exists attempts integer not null default 1;
alter table public.flow_push_deliveries add column if not exists retry_at timestamptz;
create or replace function public.claim_flow_push(p_subscription uuid,p_event text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare claimed integer;
begin
    insert into public.flow_push_deliveries(subscription_id,event_key,state)
    values(p_subscription,p_event,'sending')
    on conflict(subscription_id,event_key) do update
        set state='sending',claimed_at=now(),retry_at=null,attempts=flow_push_deliveries.attempts+1
        where flow_push_deliveries.state='failed' and flow_push_deliveries.retry_at<=now()
            and flow_push_deliveries.attempts<3;
    get diagnostics claimed = row_count;
    return claimed=1;
end;
$$;
revoke all on function public.claim_flow_push(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_flow_push(uuid,text) to service_role;
