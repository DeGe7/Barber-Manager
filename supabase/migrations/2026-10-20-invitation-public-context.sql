begin;

create or replace function public.get_public_organization_invitation_info(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.organization_invitations;
  invitation_status text;
  organization_name text;
  professional_name text;
begin
  if nullif(btrim(coalesce(p_token, '')), '') is null then
    return jsonb_build_object('valid', false, 'status', 'invalid', 'channel', null);
  end if;

  select i
    into invitation
    from public.organization_invitations i
   where i.token_hash = encode(extensions.digest(btrim(p_token), 'sha256'), 'hex')
   limit 1;
  if invitation.id is null then
    return jsonb_build_object('valid', false, 'status', 'invalid', 'channel', null);
  end if;

  invitation_status := case
    when invitation.revoked_at is not null then 'revoked'
    when invitation.accepted_at is not null then 'used'
    when invitation.expires_at <= now() then 'expired'
    else 'valid'
  end;
  if invitation_status = 'valid' then
    select o.name, p.name
      into organization_name, professional_name
      from public.organizations o
      join public.professionals p on p.id = invitation.professional_id
     where o.id = invitation.organization_id;
  end if;
  return jsonb_build_object(
    'valid', invitation_status = 'valid',
    'status', invitation_status,
    'channel', case when invitation.phone is not null then 'phone' else 'email' end,
    'email', case when invitation_status = 'valid' and invitation.phone is null then invitation.email else null end,
    'organization_name', case when invitation_status = 'valid' then organization_name else null end,
    'professional_name', case when invitation_status = 'valid' then professional_name else null end
  );
end;
$$;

revoke all on function public.get_public_organization_invitation_info(text)
  from public, anon, authenticated;
grant execute on function public.get_public_organization_invitation_info(text)
  to anon, authenticated;

update public.schema_metadata
   set value = '2026-10-20.1',
       updated_at = now()
 where key = 'app_schema_version';

commit;
