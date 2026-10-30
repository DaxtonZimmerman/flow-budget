-- Scalar JSON avoids the Data API row cap. One MVCC statement reads the cursor
-- and every transaction from the same database snapshot, including empty feeds.
create or replace function public.read_plaid_snapshot(p_connection uuid,p_owner uuid,p_cursor text)
returns jsonb language sql stable security invoker set search_path='' as $$
    select pg_catalog.jsonb_build_object(
        'complete',true,'count',count(t.transaction_id),
        'transactions',coalesce(pg_catalog.jsonb_agg(t.data order by t.transaction_id)
            filter(where t.transaction_id is not null),'[]'::jsonb))
    from public.plaid_connections c
    left join public.plaid_transactions t on t.item_id=c.item_id
    where c.id=p_connection and c.user_id=p_owner and c.cursor is not distinct from p_cursor
    group by c.id;
$$;
revoke all on function public.read_plaid_snapshot(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_plaid_snapshot(uuid,uuid,text) to service_role;
