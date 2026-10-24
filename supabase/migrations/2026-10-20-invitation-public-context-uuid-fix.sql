begin;

create or replace function public.get_public_organization_invitation_info(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation_id public.organization_invitations.id%type;
  invitation_organization_id public.organization_invitations.organization_id%type;
  invitation_professional_id public.organization_invitations.professional_id%type;
  invitation_revoked_at public.organization_invitations.revoked_at%type;
  invitation_accepted_at public.organization_invitations.accepted_at%type;
  invitation_expires_at public.organization_invitations.expires_at%type;
  invitation_phone public.organization_invitations.phone%type;
  invitation_email public.organization_invitations.email%type;
  invitation_status text;
  organization_name text;
  professional_name text;
begin
  if nullif(btrim(coalesce(p_token, '')), '') is null then
    return jsonb_build_object('valid', false, 'status', 'invalid', 'channel', null);
  end if;

  select i.id,
         i.organization_id,
         i.professional_id,
         i.revoked_at,
         i.accepted_at,
         i.expires_at,
         i.phone,
         i.email
    into invitation_id,
         invitation_organization_id,
         invitation_professional_id,
         invitation_revoked_at,
         invitation_accepted_at,
         invitation_expires_at,
         invitation_phone,
         invitation_email
    from public.organization_invitations i
   where i.token_hash = encode(extensions.digest(btrim(p_token), 'sha256'), 'hex')
   limit 1;

  if invitation_id is null then
    return jsonb_build_object('valid', false, 'status', 'invalid', 'channel', null);
  end if;

  invitation_status := case
    when invitation_revoked_at is not null then 'revoked'
    when invitation_accepted_at is not null then 'used'
    when invitation_expires_at <= now() then 'expired'
    else 'valid'
  end;

  if invitation_status = 'valid' then
    select o.name, p.name
      into organization_name, professional_name
      from public.organizations o
      join public.professionals p on p.id = invitation_professional_id
     where o.id = invitation_organization_id;
  end if;

  return jsonb_build_object(
    'valid', invitation_status = 'valid',
    'status', invitation_status,
    'channel', case when invitation_phone is not null then 'phone' else 'email' end,
    'email', case when invitation_status = 'valid' and invitation_phone is null then invitation_email else null end,
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
   set value = '2026-10-20.2',
       updated_at = now()
 where key = 'app_schema_version';

commit;
