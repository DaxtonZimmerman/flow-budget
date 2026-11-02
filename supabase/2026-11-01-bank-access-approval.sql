-- Only the signed-in bank endpoint uses these tables/functions. No browser grants.
create table if not exists public.bank_access_requests (
    user_id uuid primary key references auth.users(id) on delete cascade,
    status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'connected')),
    requested_at timestamptz not null default now(),
    reviewed_at timestamptz,
    reviewed_by uuid references auth.users(id) on delete set null
);
alter table public.bank_access_requests enable row level security;
revoke all on public.bank_access_requests from public, anon, authenticated;
grant select, insert, update, delete on public.bank_access_requests to service_role;

create or replace function public.request_bank_access(requester uuid)
returns void language sql security invoker set search_path = '' as $$
    insert into public.bank_access_requests(user_id) values(requester)
    on conflict(user_id) do nothing;
$$;

create or replace function public.list_bank_access_requests()
returns table(user_id uuid, email text, status text, requested_at timestamptz)
language sql security definer set search_path = '' as $$
    select r.user_id, u.email::text, r.status, r.requested_at
    from public.bank_access_requests r join auth.users u on u.id = r.user_id
    order by (r.status = 'pending') desc, r.requested_at desc limit 100;
$$;

create or replace function public.decide_bank_access(requester uuid, reviewer uuid, decision text, expected_status text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
    if decision not in ('approved', 'denied') then raise exception 'Invalid decision'; end if;
    update public.bank_access_requests set status = decision, reviewed_by = reviewer, reviewed_at = now()
    where user_id = requester and status = expected_status and status <> 'connected';
    return found;
end;
$$;

create or replace function public.save_approved_bank_connection(connection jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare requester uuid := (connection->>'user_id')::uuid;
begin
    perform 1 from public.bank_access_requests where user_id = requester and status = 'approved' for update;
    if not found or connection->>'environment' <> 'production' then return false; end if;
    insert into public.plaid_connections(user_id,item_id,access_token,environment,institution_name,recovery_required)
    values(requester,connection->>'item_id',connection->>'access_token','production',left(connection->>'institution_name',100),false);
    update public.bank_access_requests set status = 'connected' where user_id = requester;
    return true;
end;
$$;

revoke all on function public.request_bank_access(uuid) from public, anon, authenticated;
revoke all on function public.list_bank_access_requests() from public, anon, authenticated;
revoke all on function public.decide_bank_access(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.save_approved_bank_connection(jsonb) from public, anon, authenticated;
grant execute on function public.request_bank_access(uuid) to service_role;
grant execute on function public.list_bank_access_requests() to service_role;
grant execute on function public.decide_bank_access(uuid,uuid,text,text) to service_role;
grant execute on function public.save_approved_bank_connection(jsonb) to service_role;
