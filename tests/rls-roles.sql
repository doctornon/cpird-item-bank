-- Integration test: RLS access boundaries per role.
-- Read-only; wrapped in a rolled-back transaction so it is safe against any environment.
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/rls-roles.sql
begin;
do $$
declare writer uuid; committee uuid; student uuid; n int; total_np int;
begin
  select count(*) into total_np from public.bank_items where status<>'personal';
  select r.user_id into writer from public.exam_item_roles r
    where r.role='item_writer'
      and not exists(select 1 from public.exam_item_roles r2 where r2.user_id=r.user_id and r2.role<>'item_writer')
      and not exists(select 1 from public.admin_grants g where g.user_id=r.user_id and g.kind='super_admin' and g.revoked_at is null) limit 1;
  select r.user_id into committee from public.exam_item_roles r
    where r.role in ('reviewer','set_manager','analyst','committee')
      and not exists(select 1 from public.admin_grants g where g.user_id=r.user_id and g.kind='super_admin' and g.revoked_at is null) limit 1;
  select p.id into student from public.profiles p where p.role='student'
      and not exists(select 1 from public.exam_item_roles r where r.user_id=p.id)
      and not exists(select 1 from public.admin_grants g where g.user_id=p.id and g.kind='super_admin' and g.revoked_at is null) limit 1;

  perform set_config('role','authenticated',true);

  if writer is not null then
    perform set_config('request.jwt.claims', json_build_object('sub',writer,'role','authenticated')::text, true);
    select count(*) into n from public.bank_items where status<>'personal' and author_id<>writer;
    if n<>0 then raise exception 'RLS FAIL: item_writer sees % others'' non-personal items (must be 0)', n; end if;
    select count(*) into n from public.exam_sets;
    if n<>0 then raise exception 'RLS FAIL: item_writer sees % exam_sets (must be 0)', n; end if;
  else raise notice 'skip: no clean item_writer'; end if;

  if student is not null then
    perform set_config('request.jwt.claims', json_build_object('sub',student,'role','authenticated')::text, true);
    select count(*) into n from public.bank_items; if n<>0 then raise exception 'RLS FAIL: student sees % bank_items (must be 0)', n; end if;
    select count(*) into n from public.exam_sets;  if n<>0 then raise exception 'RLS FAIL: student sees % exam_sets (must be 0)', n; end if;
  else raise notice 'skip: no clean student'; end if;

  if committee is not null then
    perform set_config('request.jwt.claims', json_build_object('sub',committee,'role','authenticated')::text, true);
    select count(*) into n from public.bank_items where status<>'personal';
    if n<>total_np then raise exception 'RLS FAIL: committee sees %/% non-personal items (must see all)', n, total_np; end if;
    select count(*) into n from public.center_students_list(null,'mine');
    if n<>0 then raise exception 'RLS FAIL: non-center-staff sees % center students (must be 0)', n; end if;
  else raise notice 'skip: no clean committee'; end if;

  raise notice 'rls-roles: ALL ASSERTIONS PASSED';
end $$;
rollback;
