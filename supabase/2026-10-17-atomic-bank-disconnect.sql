-- Keep the bank connection and saved Flow transactions in one database change.
-- Deploy before the matching plaid Edge Function update.
create or replace function public.disconnect_plaid_connection(
    connection_id uuid,
    owner_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    bank_item text;
    saved jsonb;
begin
    select item_id into bank_item
    from public.plaid_connections
    where id = connection_id and user_id = owner_id
    for update;

    if bank_item is null then
        raise exception 'Bank connection not found';
    end if;

    delete from public.plaid_connections
    where id = connection_id and user_id = owner_id;

    update public.flow_data
    set data = pg_catalog.jsonb_set(
            data,
            '{transactions}',
            coalesce((
                select pg_catalog.jsonb_agg(entry.value order by entry.position)
                from pg_catalog.jsonb_array_elements(
                    coalesce(data->'transactions', '[]'::jsonb)
                ) with ordinality as entry(value, position)
                where entry.value->>'bankConnectionId' is distinct from connection_id::text
            ), '[]'::jsonb),
            true
        ),
        revision = revision + 1,
        updated_at = now()
    where user_id = owner_id
    returning pg_catalog.jsonb_build_object('revision', revision, 'data', data)
    into saved;

    return coalesce(saved, pg_catalog.jsonb_build_object('revision', 0, 'data', null));
end;
$$;

revoke all on function public.disconnect_plaid_connection(uuid, uuid)
    from public, anon, authenticated;
grant execute on function public.disconnect_plaid_connection(uuid, uuid)
    to service_role;
