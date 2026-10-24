-- Regression coverage for phone-normalized, tenant-scoped client reuse.
-- Run with `supabase test db` against a disposable Supabase database.

begin;

create extension if not exists pgtap;
select plan(6);

set local session_replication_role = replica;

insert into public.organizations (id, name)
values ('41000000-0000-0000-0000-000000000001', 'Cadastro atômico');

insert into auth.users (
  id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '41000000-0000-0000-0000-000000000002',
  'atomic-client@example.test',
  'authenticated',
  'authenticated',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.profiles (id, email, full_name, default_organization_id)
values (
  '41000000-0000-0000-0000-000000000002',
  'atomic-client@example.test',
  'Gestor de teste',
  '41000000-0000-0000-0000-000000000001'
);

insert into public.organization_members (organization_id, user_id, role)
values (
  '41000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000002',
  'gestor'
);

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000002', true);

select is(
  (public.create_or_get_client_by_phone(
    'atomic-client-original',
    'Cliente original',
    '',
    '(11) 98765-4321',
    null,
    null,
    null,
    'barbearia',
    '2026-10-15',
    '{"id":"atomic-visit-1","date":"2026-10-15","type":"servico","description":"Corte","amount":50}'::jsonb
  )).id,
  'atomic-client-original',
  'first registration creates the client and keeps its first visit'
);

select is(
  (public.create_or_get_client_by_phone(
    'atomic-client-duplicate',
    'Nome informado depois',
    '',
    '+55 11 98765-4321',
    null,
    null,
    null,
    'barbearia',
    '2026-10-15',
    '{"id":"atomic-visit-2","date":"2026-10-15","type":"servico","description":"Barba","amount":30}'::jsonb
  )).id,
  'atomic-client-original',
  'Brazilian phone formatting resolves to the existing client'
);

select is(
  (select count(*)
     from public.clients
    where organization_id = '41000000-0000-0000-0000-000000000001'
      and regexp_replace(whatsapp, '[^0-9]', '', 'g') in ('11987654321', '5511987654321')),
  1::bigint,
  'reusing a phone does not create a second client'
);

select is(
  (select count(*)
     from jsonb_array_elements(
       (select visits from public.clients where id = 'atomic-client-original')
     ) as saved_visit(value)
    where saved_visit.value->>'id' in ('atomic-visit-1', 'atomic-visit-2')),
  2::bigint,
  'both service visits remain in the reused client history'
);

select lives_ok(
  $$insert into public.appointments (id, date, time, client, client_id, service, organization_id)
    values (
      'atomic-client-appointment',
      '2026-10-15',
      '10:00',
      'Cliente original',
      'atomic-client-original',
      'Corte',
      '41000000-0000-0000-0000-000000000001'
    )$$,
  'an appointment can link to the reused client'
);

select is(
  (select client_id from public.appointments where id = 'atomic-client-appointment'),
  'atomic-client-original',
  'the appointment keeps the canonical client id'
);

select * from finish();
rollback;
