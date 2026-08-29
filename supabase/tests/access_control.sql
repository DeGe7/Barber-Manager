-- Regression suite for the tenant and professional boundaries.
--
-- Run with `supabase test db` against a disposable Supabase database. The
-- fixture is transactional and uses only the public identity tables, so it
-- never creates real Auth accounts or leaves business data behind.

begin;

create extension if not exists pgtap;

select plan(93);

select is(
  (select count(*) from storage.buckets where id in ('avatars', 'logos') and public = false),
  2::bigint,
  'avatar and logo buckets are private'
);

-- Seed two organizations, one manager, one seller and one operational
-- professional in organization A, plus a manager and data in organization B.
-- The fixture is inserted as the database owner because the organization
-- assignment trigger is intentionally enforced for authenticated clients.
set local session_replication_role = replica;

insert into public.organizations (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Organização A'),
  ('22222222-2222-2222-2222-222222222222', 'Organização B');

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('10000000-0000-0000-0000-000000000001', 'gestor-a@example.com', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'vendedor-a@example.com', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-0000-0000-000000000003', 'operacional-a@example.com', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20000000-0000-0000-0000-000000000001', 'gestor-b@example.com', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, email, full_name, default_organization_id) values
  ('10000000-0000-0000-0000-000000000001', 'gestor-a@example.com', 'Gestor A', '11111111-1111-1111-1111-111111111111'),
  ('10000000-0000-0000-0000-000000000002', 'vendedor-a@example.com', 'Vendedor A', '11111111-1111-1111-1111-111111111111'),
  ('10000000-0000-0000-0000-000000000003', 'operacional-a@example.com', 'Operacional A', '11111111-1111-1111-1111-111111111111'),
  ('20000000-0000-0000-0000-000000000001', 'gestor-b@example.com', 'Gestor B', '22222222-2222-2222-2222-222222222222');

insert into public.professionals (id, name, role, organization_id) values
  ('professional-a-seller', 'Vendedor A', 'vendedor', '11111111-1111-1111-1111-111111111111'),
  ('professional-a-operator', 'Operacional A', 'barbeiro', '11111111-1111-1111-1111-111111111111'),
  ('professional-b-seller', 'Vendedor B', 'vendedor', '22222222-2222-2222-2222-222222222222');

insert into public.organization_members (organization_id, user_id, role, professional_id) values
  ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', 'gestor', null),
  ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000002', 'vendedor', 'professional-a-seller'),
  ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000003', 'barbeiro', 'professional-a-operator'),
  ('22222222-2222-2222-2222-222222222222', '20000000-0000-0000-0000-000000000001', 'gestor', null);

insert into public.organization_settings (organization_id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into storage.objects (id, bucket_id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'avatars', '10000000-0000-0000-0000-000000000001/avatar.png'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'avatars', '10000000-0000-0000-0000-000000000002/avatar.png'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'avatars', '20000000-0000-0000-0000-000000000001/avatar.png'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'logos', '11111111-1111-1111-1111-111111111111/logo.png'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'logos', '22222222-2222-2222-2222-222222222222/logo.png');

insert into public.appointments (id, date, time, client, professional_id, service, organization_id) values
  ('appointment-a-seller', '2026-08-27', '09:00', 'Cliente Vendedor A', 'professional-a-seller', 'Prótese', '11111111-1111-1111-1111-111111111111'),
  ('appointment-a-operator', '2026-08-27', '10:00', 'Cliente Operacional A', 'professional-a-operator', 'Corte', '11111111-1111-1111-1111-111111111111'),
  ('appointment-b-seller', '2026-08-27', '11:00', 'Cliente Vendedor B', 'professional-b-seller', 'Prótese', '22222222-2222-2222-2222-222222222222');

insert into public.blocks (id, date, professional_id, reason, organization_id) values
  ('block-a-seller', '2026-08-27', 'professional-a-seller', 'Pausa', '11111111-1111-1111-1111-111111111111'),
  ('block-a-operator', '2026-08-27', 'professional-a-operator', 'Folga', '11111111-1111-1111-1111-111111111111'),
  ('block-b-seller', '2026-08-27', 'professional-b-seller', 'Pausa', '22222222-2222-2222-2222-222222222222');

insert into public.prothesis_sales (id, date, client, value, seller_id, organization_id) values
  ('sale-a-seller', '2026-08-27', 'Cliente Venda A', 100, 'professional-a-seller', '11111111-1111-1111-1111-111111111111'),
  ('sale-a-operator', '2026-08-27', 'Cliente Operacional A', 300, 'professional-a-operator', '11111111-1111-1111-1111-111111111111'),
  ('sale-b-seller', '2026-08-27', 'Cliente Venda B', 200, 'professional-b-seller', '22222222-2222-2222-2222-222222222222');

insert into public.mentoria_sessions (id, date, client, seller_id, organization_id) values
  ('mentoria-a-seller', '2026-08-27', 'Cliente Mentoria A', 'professional-a-seller', '11111111-1111-1111-1111-111111111111'),
  ('mentoria-a-operator', '2026-08-27', 'Cliente Operacional A', 'professional-a-operator', '11111111-1111-1111-1111-111111111111'),
  ('mentoria-b-seller', '2026-08-27', 'Cliente Mentoria B', 'professional-b-seller', '22222222-2222-2222-2222-222222222222');

insert into public.subscription_plans (id, name, price, organization_id) values
  ('plan-a', 'Plano A', 100, '11111111-1111-1111-1111-111111111111'),
  ('plan-b', 'Plano B', 200, '22222222-2222-2222-2222-222222222222');

insert into public.subscribers (id, name, plan_id, professional_id, start_date, next_payment, organization_id) values
  ('subscriber-a-seller', 'Assinante A', 'plan-a', 'professional-a-seller', '2026-08-01', '2026-09-01', '11111111-1111-1111-1111-111111111111'),
  ('subscriber-a-operator', 'Assinante Operacional A', 'plan-a', 'professional-a-operator', '2026-08-01', '2026-09-01', '11111111-1111-1111-1111-111111111111'),
  ('subscriber-b-seller', 'Assinante B', 'plan-b', 'professional-b-seller', '2026-08-01', '2026-09-01', '22222222-2222-2222-2222-222222222222');

reset session_replication_role;

-- Manager A can read every resource in organization A.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is((select count(*) from storage.objects where bucket_id = 'avatars' and name = '10000000-0000-0000-0000-000000000001/avatar.png'), 1::bigint, 'manager reads own avatar');
select is((select count(*) from storage.objects where bucket_id = 'avatars' and name = '10000000-0000-0000-0000-000000000002/avatar.png'), 0::bigint, 'manager cannot read another user avatar');
select is((select count(*) from storage.objects where bucket_id = 'avatars' and name = '20000000-0000-0000-0000-000000000001/avatar.png'), 0::bigint, 'manager cannot read an avatar from another organization');
select lives_ok($$insert into storage.objects (id, bucket_id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab', 'avatars', '10000000-0000-0000-0000-000000000001/new-avatar.png')$$, 'user can write an avatar under own path');
select throws_ok($$insert into storage.objects (id, bucket_id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaac', 'avatars', '10000000-0000-0000-0000-000000000002/forged-avatar.png')$$, null, null, 'user cannot write an avatar under another user path');
select is((select count(*) from storage.objects where bucket_id = 'logos' and name = '11111111-1111-1111-1111-111111111111/logo.png'), 1::bigint, 'manager reads own organization logo');
select is((select count(*) from storage.objects where bucket_id = 'logos' and name = '22222222-2222-2222-2222-222222222222/logo.png'), 0::bigint, 'manager cannot read a logo from another organization');
select lives_ok($$insert into storage.objects (id, bucket_id, name) values ('dddddddd-dddd-dddd-dddd-ddddddddddde', 'logos', '11111111-1111-1111-1111-111111111111/new-logo.png')$$, 'manager can write own organization logo');
select throws_ok($$insert into storage.objects (id, bucket_id, name) values ('dddddddd-dddd-dddd-dddd-dddddddddddf', 'logos', '22222222-2222-2222-2222-222222222222/forged-logo.png')$$, null, null, 'manager cannot write a logo from another organization');
select is((select count(*) from public.appointments), 2::bigint, 'manager reads all appointments in own organization');
select is((select count(*) from public.blocks), 2::bigint, 'manager reads all blocks in own organization');
select is((select count(*) from public.prothesis_sales), 2::bigint, 'manager reads all sales in own organization');
select is((select count(*) from public.mentoria_sessions), 2::bigint, 'manager reads all mentoring sessions in own organization');
select is((select count(*) from public.subscription_plans), 1::bigint, 'manager reads plans in own organization');
select is((select count(*) from public.subscribers), 2::bigint, 'manager reads subscriptions in own organization');

select lives_ok($$insert into public.appointments (id, date, time, client, professional_id, service) values ('manager-appointment', '2026-08-28', '09:00', 'Cliente Gestor', 'professional-a-operator', 'Corte')$$, 'manager can create an appointment for any own professional');
select lives_ok($$update public.appointments set professional_id = 'professional-a-seller' where id = 'manager-appointment'$$, 'manager can reassign an appointment within own organization');
select lives_ok($$delete from public.appointments where id = 'manager-appointment'$$, 'manager can delete an appointment in own organization');
select lives_ok($$insert into public.blocks (id, date, professional_id, reason) values ('manager-block', '2026-08-28', 'professional-a-operator', 'Reunião')$$, 'manager can create a block for any own professional');
select lives_ok($$update public.blocks set professional_id = 'professional-a-seller' where id = 'manager-block'$$, 'manager can reassign a block within own organization');
select lives_ok($$delete from public.blocks where id = 'manager-block'$$, 'manager can delete a block in own organization');
select lives_ok($$insert into public.prothesis_sales (id, date, client, value, seller_id) values ('manager-sale', '2026-08-28', 'Cliente Gestor', 150, 'professional-a-operator')$$, 'manager can create a sale for any own professional');
select lives_ok($$update public.prothesis_sales set value = 175 where id = 'manager-sale'$$, 'manager can update a sale in own organization');
select lives_ok($$delete from public.prothesis_sales where id = 'manager-sale'$$, 'manager can delete a sale in own organization');
select lives_ok($$insert into public.mentoria_sessions (id, date, client, seller_id) values ('manager-mentoria', '2026-08-28', 'Cliente Gestor', 'professional-a-operator')$$, 'manager can create mentoring for any own professional');
select lives_ok($$update public.mentoria_sessions set value = 175 where id = 'manager-mentoria'$$, 'manager can update mentoring in own organization');
select lives_ok($$delete from public.mentoria_sessions where id = 'manager-mentoria'$$, 'manager can delete mentoring in own organization');
select lives_ok($$insert into public.subscription_plans (id, name, price) values ('manager-plan', 'Plano Gestor', 150)$$, 'manager can create a subscription plan');
select lives_ok($$update public.subscription_plans set price = 175 where id = 'manager-plan'$$, 'manager can update a subscription plan');
select lives_ok($$delete from public.subscription_plans where id = 'manager-plan'$$, 'manager can delete a subscription plan');
select lives_ok($$insert into public.subscribers (id, name, plan_id, professional_id, start_date, next_payment) values ('manager-subscriber', 'Assinante Gestor', 'plan-a', 'professional-a-operator', '2026-08-01', '2026-09-01')$$, 'manager can create a subscription');
select lives_ok($$update public.subscribers set status = 'pendente' where id = 'manager-subscriber'$$, 'manager can update a subscription');
select lives_ok($$delete from public.subscribers where id = 'manager-subscriber'$$, 'manager can delete a subscription');
select throws_ok($$insert into public.appointments (id, date, time, client, professional_id, service) values ('manager-foreign-appointment', '2026-08-28', '09:00', 'Cliente', 'professional-b-seller', 'Prótese')$$, null, null, 'manager cannot attach a foreign organization professional to an appointment');
select throws_ok($$insert into public.blocks (id, date, professional_id, reason) values ('manager-foreign-block', '2026-08-28', 'professional-b-seller', 'Pausa')$$, null, null, 'manager cannot attach a foreign organization professional to a block');
select throws_ok($$insert into public.prothesis_sales (id, date, client, value, seller_id) values ('manager-foreign-sale', '2026-08-28', 'Cliente', 150, 'professional-b-seller')$$, null, null, 'manager cannot attach a foreign organization professional to a sale');
select throws_ok($$insert into public.mentoria_sessions (id, date, client, seller_id) values ('manager-foreign-mentoria', '2026-08-28', 'Cliente', 'professional-b-seller')$$, null, null, 'manager cannot attach a foreign organization professional to mentoring');
select throws_ok($$insert into public.subscribers (id, name, plan_id, professional_id, start_date, next_payment) values ('manager-foreign-subscriber', 'Assinante', 'plan-b', 'professional-b-seller', '2026-08-01', '2026-09-01')$$, null, null, 'manager cannot attach foreign organization plan or professional to a subscription');

-- Seller A is restricted to the seller professional for agenda, sales and
-- mentoring. Plans and subscribers are manager-only.
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select is((select count(*) from storage.objects where bucket_id = 'avatars' and name = '10000000-0000-0000-0000-000000000002/avatar.png'), 1::bigint, 'seller reads own avatar');
select is((select count(*) from storage.objects where bucket_id = 'avatars' and name = '10000000-0000-0000-0000-000000000001/avatar.png'), 0::bigint, 'seller cannot read another user avatar');
select is((select count(*) from storage.objects where bucket_id = 'avatars' and name = '20000000-0000-0000-0000-000000000001/avatar.png'), 0::bigint, 'seller cannot read an avatar from another organization');
select lives_ok($$insert into storage.objects (id, bucket_id, name) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbc', 'avatars', '10000000-0000-0000-0000-000000000002/new-avatar.png')$$, 'seller can write an avatar under own path');
select throws_ok($$insert into storage.objects (id, bucket_id, name) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbd', 'avatars', '10000000-0000-0000-0000-000000000001/forged-avatar.png')$$, null, null, 'seller cannot write an avatar under another user path');
select is((select count(*) from storage.objects where bucket_id = 'logos' and name = '11111111-1111-1111-1111-111111111111/logo.png'), 0::bigint, 'seller cannot read the current organization logo');
select is((select count(*) from storage.objects where bucket_id = 'logos' and name = '22222222-2222-2222-2222-222222222222/logo.png'), 0::bigint, 'seller cannot read a logo from another organization');
select throws_ok($$insert into storage.objects (id, bucket_id, name) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbe', 'logos', '11111111-1111-1111-1111-111111111111/forged-logo.png')$$, null, null, 'seller cannot write the current organization logo');
select throws_ok($$insert into storage.objects (id, bucket_id, name) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbf', 'logos', '22222222-2222-2222-2222-222222222222/forged-logo.png')$$, null, null, 'seller cannot write a logo from another organization');
select is((select count(*) from public.appointments), 1::bigint, 'seller reads only own appointments');
select is((select count(*) from public.blocks), 1::bigint, 'seller reads only own blocks');
select is((select count(*) from public.prothesis_sales), 1::bigint, 'seller reads only own sales');
select is((select count(*) from public.mentoria_sessions), 1::bigint, 'seller reads only own mentoring sessions');
select is((select count(*) from public.subscription_plans), 0::bigint, 'seller cannot read subscription plans');
select is((select count(*) from public.subscribers), 0::bigint, 'seller cannot read subscriptions');
select lives_ok($$insert into public.appointments (id, date, time, client, professional_id, service) values ('seller-appointment', '2026-08-28', '09:00', 'Cliente Vendedor', 'professional-a-seller', 'Prótese')$$, 'seller can create own appointment');
select lives_ok($$update public.appointments set status = 'confirmed' where id = 'seller-appointment'$$, 'seller can update own appointment');
select lives_ok($$insert into public.blocks (id, date, professional_id, reason) values ('seller-block', '2026-08-28', 'professional-a-seller', 'Pausa')$$, 'seller can create own block');
select lives_ok($$update public.blocks set reason = 'Reunião' where id = 'seller-block'$$, 'seller can update own block');
select lives_ok($$insert into public.prothesis_sales (id, date, client, value, seller_id) values ('seller-sale', '2026-08-28', 'Cliente Vendedor', 125, 'professional-a-seller')$$, 'seller can create own sale');
select lives_ok($$update public.prothesis_sales set value = 140 where id = 'seller-sale'$$, 'seller can update own sale');
select lives_ok($$insert into public.mentoria_sessions (id, date, client, seller_id) values ('seller-mentoria', '2026-08-28', 'Cliente Vendedor', 'professional-a-seller')$$, 'seller can create own mentoring');
select lives_ok($$update public.mentoria_sessions set value = 140 where id = 'seller-mentoria'$$, 'seller can update own mentoring');
select throws_ok($$insert into public.subscribers (id, name, plan_id, professional_id, start_date, next_payment) values ('seller-subscriber', 'Assinante Vendedor', 'plan-a', 'professional-a-seller', '2026-08-01', '2026-09-01')$$, null, null, 'seller cannot create subscriptions');
select throws_ok($$insert into public.appointments (id, date, time, client, professional_id, service) values ('seller-other-appointment', '2026-08-28', '09:00', 'Cliente', 'professional-a-operator', 'Corte')$$, null, null, 'seller cannot create an appointment for another professional');
select throws_ok($$update public.appointments set professional_id = 'professional-a-operator' where id = 'seller-appointment'$$, null, null, 'seller cannot change the professional of an appointment');
select throws_ok($$insert into public.appointments (id, date, time, client, professional_id, service, organization_id) values ('seller-cross-org', '2026-08-28', '09:00', 'Cliente', 'professional-b-seller', 'Prótese', '22222222-2222-2222-2222-222222222222')$$, null, null, 'seller cannot write another organization context');
select throws_ok($$update public.profiles set default_organization_id = '22222222-2222-2222-2222-222222222222' where id = '10000000-0000-0000-0000-000000000002'$$, null, null, 'browser cannot change the default organization');
select lives_ok($$
  with attempted as (
    update public.organization_members
       set role = 'gestor', professional_id = null
     where user_id = '10000000-0000-0000-0000-000000000002'
    returning user_id
  )
  select 1 / case when exists (select 1 from attempted) then 0 else 1 end
$$, 'browser cannot change organization or professional membership');
select lives_ok($$update public.prothesis_sales set value = 999 where id = 'sale-a-operator'$$, 'seller update of another sale is filtered by RLS');
reset role;
select is((select value from public.prothesis_sales where id = 'sale-a-operator'), 300::double precision, 'seller cannot change another professional sale');

-- Operational A can use only the own agenda and blocks and cannot use sales,
-- mentoring or subscriptions.
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select is((select count(*) from public.appointments), 1::bigint, 'operational professional reads own appointments');
select is((select count(*) from public.blocks), 1::bigint, 'operational professional reads own blocks');
select is((select count(*) from public.prothesis_sales), 0::bigint, 'operational professional cannot read sales');
select is((select count(*) from public.mentoria_sessions), 0::bigint, 'operational professional cannot read mentoring');
select is((select count(*) from public.subscribers), 0::bigint, 'operational professional cannot read subscriptions');
select lives_ok($$insert into public.appointments (id, date, time, client, professional_id, service) values ('operator-appointment', '2026-08-28', '10:00', 'Cliente Operacional', 'professional-a-operator', 'Corte')$$, 'operational professional can create own appointment');
select lives_ok($$update public.blocks set reason = 'Compromisso' where id = 'block-a-operator'$$, 'operational professional can update own block');
select throws_ok($$insert into public.prothesis_sales (id, date, client, value, seller_id) values ('operator-sale', '2026-08-28', 'Cliente Operacional', 90, 'professional-a-operator')$$, null, null, 'operational professional cannot create sales');
select throws_ok($$insert into public.mentoria_sessions (id, date, client, seller_id) values ('operator-mentoria', '2026-08-28', 'Cliente Operacional', 'professional-a-operator')$$, null, null, 'operational professional cannot create mentoring');
select throws_ok($$insert into public.subscribers (id, name, plan_id, professional_id, start_date, next_payment) values ('operator-subscriber', 'Assinante Operacional', 'plan-a', 'professional-a-operator', '2026-08-01', '2026-09-01')$$, null, null, 'operational professional cannot create subscriptions');
select throws_ok($$insert into public.appointments (id, date, time, client, professional_id, service) values ('operator-other-appointment', '2026-08-28', '10:00', 'Cliente', 'professional-a-seller', 'Prótese')$$, null, null, 'operational professional cannot create an appointment for another professional');

-- Organization A must never see organization B, and even its manager cannot
-- inject or move a row into the other organization.
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select is((select count(*) from public.appointments where organization_id = '22222222-2222-2222-2222-222222222222'), 0::bigint, 'manager cannot read appointments from another organization');
select is((select count(*) from public.blocks where organization_id = '22222222-2222-2222-2222-222222222222'), 0::bigint, 'manager cannot read blocks from another organization');
select is((select count(*) from public.prothesis_sales where organization_id = '22222222-2222-2222-2222-222222222222'), 0::bigint, 'manager cannot read sales from another organization');
select is((select count(*) from public.mentoria_sessions where organization_id = '22222222-2222-2222-2222-222222222222'), 0::bigint, 'manager cannot read mentoring from another organization');
select is((select count(*) from public.subscription_plans where organization_id = '22222222-2222-2222-2222-222222222222'), 0::bigint, 'manager cannot read plans from another organization');
select is((select count(*) from public.subscribers where organization_id = '22222222-2222-2222-2222-222222222222'), 0::bigint, 'manager cannot read subscriptions from another organization');
select throws_ok($$insert into public.appointments (id, date, time, client, professional_id, service, organization_id) values ('manager-cross-org', '2026-08-28', '09:00', 'Cliente', 'professional-b-seller', 'Prótese', '22222222-2222-2222-2222-222222222222')$$, null, null, 'manager cannot create a row in another organization');
select throws_ok($$update public.appointments set organization_id = '22222222-2222-2222-2222-222222222222' where id = 'appointment-a-seller'$$, null, null, 'manager cannot move a row to another organization');

reset role;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select is((select count(*) from storage.objects where bucket_id = 'avatars' and name = '20000000-0000-0000-0000-000000000001/avatar.png'), 1::bigint, 'manager of organization B reads own avatar');
select is((select count(*) from storage.objects where bucket_id = 'avatars' and name = '10000000-0000-0000-0000-000000000001/avatar.png'), 0::bigint, 'manager of organization B cannot read an avatar from organization A');
select is((select count(*) from storage.objects where bucket_id = 'logos' and name = '22222222-2222-2222-2222-222222222222/logo.png'), 1::bigint, 'manager of organization B reads own organization logo');
select is((select count(*) from storage.objects where bucket_id = 'logos' and name = '11111111-1111-1111-1111-111111111111/logo.png'), 0::bigint, 'manager of organization B cannot read a logo from organization A');

select * from finish();
rollback;