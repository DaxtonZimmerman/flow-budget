-- Projects created without automatic table grants need these explicit privileges.
-- The signed-in, owner-checked bank endpoint calls complete_plaid_recovery as
-- service_role. That SECURITY INVOKER function must lock/read and update the
-- existing workspace in the same transaction as its protected recovery copy.
-- Browser roles, owner RLS, provider credentials and stored data stay unchanged.
grant select, update on public.flow_data to service_role;
