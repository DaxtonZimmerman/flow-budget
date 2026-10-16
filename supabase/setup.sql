-- run this once in the Supabase SQL Editor

create table if not exists public.flow_data (
    user_id uuid primary key references auth.users(id) on delete cascade,
    revision bigint not null default 1,
    data jsonb not null,
    updated_at timestamptz not null default now()
);

alter table public.flow_data enable row level security;

create policy "read own Flow data"
on public.flow_data for select to authenticated
using ((select auth.uid()) = user_id);

create policy "add own Flow data"
on public.flow_data for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "update own Flow data"
on public.flow_data for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.save_flow_data(
    expected_revision bigint,
    new_data jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
    next_revision bigint;
begin
    if (select auth.uid()) is null then
        raise exception 'Sign in first';
    end if;

    if expected_revision = 0 then
        insert into public.flow_data (user_id, revision, data)
        values ((select auth.uid()), 1, new_data)
        on conflict do nothing
        returning revision into next_revision;
    else
        update public.flow_data
        set revision = revision + 1,
            data = new_data,
            updated_at = now()
        where user_id = (select auth.uid())
          and revision = expected_revision
        returning revision into next_revision;
    end if;

    if next_revision is null then
        raise exception 'Flow data changed on another device';
    end if;

    return next_revision;
end;
$$;

revoke all on function public.save_flow_data(bigint, jsonb) from public, anon;
revoke all on public.flow_data from anon;
grant select, insert, update on public.flow_data to authenticated;
grant execute on function public.save_flow_data(bigint, jsonb) to authenticated;

-- the signed-in person can remove their account and its Flow data
create or replace function public.delete_flow_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if (select auth.uid()) is null then
        raise exception 'Sign in first';
    end if;

    delete from auth.users where id = (select auth.uid());
end;
$$;

revoke all on function public.delete_flow_account() from public, anon;
grant execute on function public.delete_flow_account() to authenticated;
