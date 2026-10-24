begin;

create or replace function public.revoke_approved_join_request_invitation(
  p_request_id uuid,
  p_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.organization_invitations;
  join_request public.organization_join_requests;
begin
  if auth.uid() is null or not public.is_manager() then
    raise exception 'only managers can revoke approved-request invitations';
  end if;

  -- Lock the invitation first, matching accept_organization_invitation's lock
  -- order so acceptance and revocation cannot both succeed or deadlock.
  select * into invitation
    from public.organization_invitations
   where id = p_invitation_id
     and organization_id = public.current_organization_id()
   for update;
  if invitation.id is null
     or invitation.accepted_at is not null
     or invitation.revoked_at is not null
     or invitation.expires_at <= now() then
    raise exception 'pending approved-request invitation not found';
  end if;

  select * into join_request
    from public.organization_join_requests
   where id = p_request_id
     and organization_id = public.current_organization_id()
     and status = 'approved'
     and user_id is null
   for update;
  if join_request.id is null
     or join_request.professional_id is distinct from invitation.professional_id
     or not (
       (invitation.email is not null
         and lower(invitation.email) = lower(coalesce(join_request.applicant_email, '')))
       or (invitation.phone is not null
         and invitation.phone = join_request.applicant_phone)
     ) then
    raise exception 'pending approved-request invitation not found';
  end if;

  update public.organization_invitations
     set revoked_at = now()
   where id = invitation.id
     and accepted_at is null
     and revoked_at is null;
  if not found then
    raise exception 'pending approved-request invitation not found';
  end if;

  update public.organization_join_requests
     set status = 'pending',
         professional_id = null,
         reviewed_at = null,
         reviewed_by = null
   where id = join_request.id;
end;
$$;

revoke all on function public.revoke_approved_join_request_invitation(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.revoke_approved_join_request_invitation(uuid, uuid)
to authenticated;

insert into public.schema_metadata (key, value)
values ('app_schema_version', '2026-10-14.5')
on conflict (key) do update
  set value = excluded.value, updated_at = now();

commit;
