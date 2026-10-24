-- Permite que gestores excluam permanentemente convites do próprio estabelecimento.
begin;

create or replace function public.delete_organization_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_manager() then
    raise exception 'only managers can delete invitations';
  end if;

  delete from public.organization_invitations
   where id = p_invitation_id
     and organization_id = public.current_organization_id();

  if not found then
    raise exception 'invitation not found or not permitted';
  end if;
end;
$$;

revoke all on function public.delete_organization_invitation(uuid)
from public, anon, authenticated;
grant execute on function public.delete_organization_invitation(uuid)
to authenticated;

insert into public.schema_metadata (key, value)
values ('app_schema_version', '2026-10-14')
on conflict (key)
do update set value = excluded.value, updated_at = now();

commit;
