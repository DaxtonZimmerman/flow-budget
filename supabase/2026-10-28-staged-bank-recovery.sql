-- Additive: original Plaid Items and existing workspaces are never removed.
-- Apply before the updated bank function and frontend. Service-only completion
-- backs up the prior workspace and activates the staged feed in one transaction.
alter table public.plaid_connections
    add column if not exists recovery_required boolean not null default false,
    add column if not exists history_complete boolean not null default false;

create table if not exists public.flow_bank_recovery_backups (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    connection_id uuid not null,
    revision bigint not null,
    data jsonb not null,
    saved_at timestamptz not null default now()
);
alter table public.flow_bank_recovery_backups enable row level security;
revoke all on public.flow_bank_recovery_backups from public, anon, authenticated;
grant select on public.flow_bank_recovery_backups to authenticated;
grant select, insert, update, delete on public.flow_bank_recovery_backups to service_role;
drop policy if exists "Read own bank recovery copies" on public.flow_bank_recovery_backups;
create policy "Read own bank recovery copies" on public.flow_bank_recovery_backups
    for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.complete_plaid_recovery(
    connection_id uuid, owner_id uuid, expected_revision bigint,
    expected_cursor text, new_data jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    bank public.plaid_connections%rowtype;
    workspace public.flow_data%rowtype;
    result jsonb;
begin
    select * into bank from public.plaid_connections
    where id = connection_id and user_id = owner_id for update;
    if bank.id is null or bank.environment <> 'production' or not bank.recovery_required
       or not bank.history_complete or bank.cursor is distinct from expected_cursor then
        raise exception 'Open a fresh completed bank preview';
    end if;
    select * into workspace from public.flow_data where user_id = owner_id for update;
    if workspace.user_id is null or workspace.revision <> expected_revision then
        raise exception 'Saved work changed. Open a fresh preview';
    end if;
    if new_data->>'clientSchemaVersion' is distinct from '2'
       or pg_catalog.jsonb_typeof(new_data->'transactions') is distinct from 'array'
       or pg_catalog.jsonb_typeof(new_data->'bankAccounts') is distinct from 'array'
       or pg_catalog.octet_length(new_data::text) > 8000000 then
        raise exception 'Unsupported recovery data';
    end if;
    -- The backup survives a bank disconnect and is readable only by its owner.
    insert into public.flow_bank_recovery_backups(user_id, connection_id, revision, data)
    values(owner_id, connection_id, workspace.revision, workspace.data);
    update public.flow_data set data = new_data, revision = revision + 1, updated_at = now()
    where user_id = owner_id
    returning pg_catalog.jsonb_build_object('data', data, 'revision', revision) into result;
    update public.plaid_connections set recovery_required = false
    where id = connection_id and user_id = owner_id;
    return result;
end;
$$;
revoke all on function public.complete_plaid_recovery(uuid, uuid, bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.complete_plaid_recovery(uuid, uuid, bigint, text, jsonb) to service_role;
