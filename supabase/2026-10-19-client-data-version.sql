-- Apply before publishing the expanded planning tools.
-- Stops an older open client from dropping newer transaction metadata.
create or replace function public.protect_flow_data_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if coalesce(old.data->>'clientSchemaVersion', '1') = '2'
       and coalesce(new.data->>'clientSchemaVersion', '1') <> '2' then
        raise exception 'Update Flow before saving this workspace';
    end if;
    return new;
end;
$$;

revoke all on function public.protect_flow_data_version() from public, anon, authenticated;
drop trigger if exists flow_data_version_guard on public.flow_data;
create trigger flow_data_version_guard
before update of data on public.flow_data
for each row execute function public.protect_flow_data_version();
