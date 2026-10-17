-- The table-RLS event trigger does not need to be callable by browser roles.
-- Applied to the existing Flow project on 2026-10-17. Keep this for repeatable setup.
do $$
begin
    if to_regprocedure('public.rls_auto_enable()') is not null then
        revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
    end if;
end;
$$;
