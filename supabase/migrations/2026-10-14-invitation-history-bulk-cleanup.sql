-- Remove em lote somente convites expirados ou revogados da organização ativa.
begin;

create or replace function public.cleanup_historical_organization_invitations()
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_ids uuid[];
begin
  if auth.uid() is null or not public.is_manager() then
    raise exception 'only managers can clean invitations';
  end if;

  with deleted as (
    delete from public.organization_invitations
     where organization_id = public.current_organization_id()
       and accepted_at is null
       and (revoked_at is not null or expires_at <= now())
    returning id
  )
  select coalesce(array_agg(id), array[]::uuid[])
    into deleted_ids
    from deleted;

  return deleted_ids;
end;
$$;

revoke all on function public.cleanup_historical_organization_invitations()
from public, anon, authenticated;
grant execute on function public.cleanup_historical_organization_invitations()
to authenticated;

insert into public.schema_metadata (key, value)
values ('app_schema_version', '2026-10-14.1')
on conflict (key)
do update set value = excluded.value, updated_at = now();

notify pgrst, 'reload schema';

commit;
