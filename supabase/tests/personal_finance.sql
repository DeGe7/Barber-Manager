begin;

create extension if not exists pgtap;

select plan(6);

select ok(
  (select prosecdef
     from pg_proc
    where oid = 'public.get_my_financial_earnings(date,date,text)'::regprocedure),
  'personal earnings are calculated by a security-definer function'
);

select ok(
  has_function_privilege('authenticated', 'public.get_my_financial_earnings(date,date,text)', 'execute'),
  'authenticated users can call their personal earnings function'
);

select ok(
  not has_function_privilege('anon', 'public.get_my_financial_earnings(date,date,text)', 'execute'),
  'anonymous users cannot call the personal earnings function'
);

select ok(
  (select qual like '%barbeiro%' and qual like '%has_permission%'
     from pg_policies
    where schemaname = 'public'
      and tablename = 'expenses'
      and policyname = 'expenses_select_member'),
  'barbers, manicures, and sales roles cannot read company expenses'
);

select ok(
  (select qual like '%barbeiro%' and qual like '%has_permission%'
     from pg_policies
    where schemaname = 'public'
      and tablename = 'incomes'
      and policyname = 'incomes_select_member'),
  'barbers, manicures, and sales roles cannot read company incomes'
);

select is(
  (select count(*)
     from pg_policies
    where schemaname = 'public'
      and tablename in ('expenses', 'incomes')),
  4::bigint,
  'finance tables have only the intended select and write policies'
);

select * from finish();
rollback;
