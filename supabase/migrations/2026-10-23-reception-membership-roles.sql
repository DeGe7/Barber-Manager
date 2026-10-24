begin;

-- Membership roles can include configured organization roles, including reception.
alter table public.organization_members
  drop constraint if exists organization_members_role_check;

alter table public.organization_invitations
  drop constraint if exists organization_invitations_role_check;

commit;
