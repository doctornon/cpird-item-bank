-- Integration test: RPC side effects. Mutations happen inside a rolled-back transaction.
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/rpc-behavior.sql
begin;
do $$
declare u uuid; app public.exam_writer_applications; hasrole boolean;
begin
  select p.id into u from public.profiles p where p.role='student'
     and not exists(select 1 from public.exam_item_roles r where r.user_id=p.id)
     and not exists(select 1 from public.exam_writer_applications w where w.user_id=p.id) limit 1;
  if u is null then raise notice 'skip: no clean student for apply test'; return; end if;

  perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
  app := public.exam_writer_apply(json_build_object(
    'full_name','__TEST__','position','x','affiliation','y','medical_center_id','',
    'specialties','อายุรศาสตร์','phone','0','email','__test__@example.invalid','motivation','',
    'consent',true,'research_consent',true)::jsonb);

  if app.status <> 'pending' then raise exception 'RPC FAIL: writer_apply status=% (want pending)', app.status; end if;
  if app.consent_at is null then raise exception 'RPC FAIL: writer_apply did not record consent_at'; end if;
  if app.research_consent is distinct from true then raise exception 'RPC FAIL: research_consent not saved'; end if;
  select exists(select 1 from public.exam_item_roles where user_id=u and role='item_writer') into hasrole;
  if not hasrole then raise exception 'RPC FAIL: item_writer role not auto-granted on apply'; end if;

  raise notice 'rpc-behavior: exam_writer_apply grants item_writer + records consent — PASS';
end $$;
rollback;  -- undo all fixtures/mutations
