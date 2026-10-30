-- Private delivery destinations. Only the signed-in Edge Function can access them.
create table if not exists public.flow_push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    endpoint text not null unique check (length(endpoint) between 20 and 2048),
    subscription jsonb not null,
    time_zone text not null default 'UTC',
    enabled boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
alter table public.flow_push_subscriptions add column if not exists last_test_at timestamptz;
create index if not exists flow_push_user on public.flow_push_subscriptions(user_id);
alter table public.flow_push_subscriptions enable row level security;
revoke all on public.flow_push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.flow_push_subscriptions to service_role;

create table if not exists public.flow_push_deliveries (
    subscription_id uuid not null references public.flow_push_subscriptions(id) on delete cascade,
    event_key text not null check (length(event_key) <= 6000),
    state text not null check (state in ('sending','sent','failed')),
    claimed_at timestamptz not null default now(),
    sent_at timestamptz,
    primary key(subscription_id,event_key)
);
alter table public.flow_push_deliveries enable row level security;
revoke all on public.flow_push_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.flow_push_deliveries to service_role;

-- Prevent overlapping scheduled runs from sending the same reminder twice.
-- Ambiguous network failures stay claimed: a missed alert is preferable to repeated alerts.
create or replace function public.claim_flow_push(p_subscription uuid,p_event text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare claimed integer;
begin
    insert into public.flow_push_deliveries(subscription_id,event_key,state)
    values(p_subscription,p_event,'sending') on conflict do nothing;
    get diagnostics claimed = row_count;
    return claimed=1;
end;
$$;
revoke all on function public.claim_flow_push(uuid,text) from public, anon, authenticated;
grant execute on function public.claim_flow_push(uuid,text) to service_role;

-- The sender reads the existing owner workspace; no new bank privileges are added.
grant select on public.flow_data to service_role;
