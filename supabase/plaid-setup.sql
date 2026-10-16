-- run this once in the Supabase SQL Editor

-- plaid tokens stay on the server and leave with the user's account
create table if not exists public.plaid_connections (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    item_id text not null unique,
    access_token text not null,
    institution_name text not null default 'Bank',
    cursor text,
    last_synced_at timestamptz,
    created_at timestamptz not null default now()
);

alter table public.plaid_connections enable row level security;
revoke all on public.plaid_connections from anon, authenticated;
grant select, insert, update, delete on public.plaid_connections to service_role;

create table if not exists public.plaid_transactions (
    item_id text not null references public.plaid_connections(item_id) on delete cascade,
    transaction_id text not null,
    account_id text not null,
    data jsonb not null,
    primary key (item_id, transaction_id)
);

alter table public.plaid_transactions enable row level security;
revoke all on public.plaid_transactions from anon, authenticated;
grant select, insert, update, delete on public.plaid_transactions to service_role;

-- save every page and its cursor together
create or replace function public.save_plaid_sync(
    connection_id uuid,
    expected_cursor text,
    next_cursor text,
    added jsonb,
    modified jsonb,
    removed jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
    bank_item text;
    saved_cursor text;
    transaction jsonb;
    removal jsonb;
begin
    select item_id, cursor into bank_item, saved_cursor
    from public.plaid_connections
    where id = connection_id
    for update;

    if bank_item is null or saved_cursor is distinct from expected_cursor then
        raise exception 'Bank data changed. Sync again.';
    end if;

    for transaction in select value from pg_catalog.jsonb_array_elements(added || modified) loop
        insert into public.plaid_transactions (item_id, transaction_id, account_id, data)
        values (bank_item, transaction->>'transaction_id', transaction->>'account_id', transaction)
        on conflict (item_id, transaction_id) do update
        set account_id = excluded.account_id,
            data = excluded.data;
    end loop;

    for removal in select value from pg_catalog.jsonb_array_elements(removed) loop
        delete from public.plaid_transactions
        where item_id = bank_item
          and transaction_id = removal->>'transaction_id';
    end loop;

    update public.plaid_connections
    set cursor = next_cursor,
        last_synced_at = now()
    where id = connection_id;
end;
$$;

revoke all on function public.save_plaid_sync(uuid, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_plaid_sync(uuid, text, text, jsonb, jsonb, jsonb) to service_role;
