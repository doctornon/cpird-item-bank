-- ภาพรวมการสมัครของศูนย์ สำหรับนักวิชาการและอาจารย์แพทย์ admin ประจำศูนย์
--
-- จงใจคืนทั้งคนที่สมัครแล้วและคนที่ยังไม่สมัคร เพราะงานคือ "ตรวจสอบให้พร้อมก่อนสอบ"
-- ไม่ใช่แค่ดูยอด และติดธงข้อมูลที่ยังไม่ครบไว้ให้เห็นทันที
--
-- ข้อควรระวัง: public.profiles มีคอลัมน์ชื่อ cid อยู่แล้ว ห้ามตั้งชื่อตัวแปร plpgsql ว่า cid
-- เพราะจะทำให้ query กำกวมและล้มตอนเรียกใช้ (เจอตอนทดสอบ จึงใช้ v_center แทน)
--
-- apply บน production แล้วเมื่อ 2026-09-19

create or replace function public.exam_center_dashboard(_exam_key text, _center_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare
  me public.profiles; s public.exam_schedule; v_center bigint; v_center_name text;
  central boolean; result jsonb;
begin
  select * into me from public.profiles where id = (select auth.uid());
  if not found then raise exception 'ไม่พบบัญชีผู้ใช้'; end if;

  central := public.auth_is_super_admin() or public.exam_has_role('registrar') or public.exam_has_role('committee');
  if not (central or me.is_center_admin or public.exam_has_role('center_staff')) then
    raise exception 'forbidden';
  end if;

  -- ส่วนกลางเลือกดูศูนย์ใดก็ได้ ส่วนเจ้าหน้าที่ศูนย์ถูกล็อกไว้ที่ศูนย์ตนเองเสมอ
  v_center := case when central then coalesce(_center_id, me.medical_center_id) else me.medical_center_id end;
  if v_center is null then raise exception 'บัญชีของท่านยังไม่ได้ผูกกับศูนย์แพทย์'; end if;
  select coalesce(mc.short_name, mc.name_th) into v_center_name from public.medical_centers mc where mc.id = v_center;

  select * into s from public.exam_schedule where exam_key = _exam_key;
  if not found then raise exception 'ไม่พบรอบสอบนี้'; end if;

  with elig as (
    select p.id, p.full_name, p.email, p.student_id, p.year_level, p.medical_center_id,
           nullif(substring(p.year_level::text from 2), '')::smallint as ynum
    from public.profiles p
    where p.role = 'student' and p.medical_center_id = v_center
  ),
  scoped as (
    select * from elig
    where array_length(s.years, 1) is null or (ynum is not null and ynum = any(s.years))
  ),
  reg as (
    select r.*, e.full_name, e.email, e.student_id, e.year_level as now_year,
           e.medical_center_id as now_center, e.ynum
    from public.exam_registrations r
    join elig e on e.id = r.user_id
    where r.exam_key = _exam_key and r.cancelled_at is null
  ),
  reg_rows as (
    select jsonb_build_object(
      'user_id', reg.user_id, 'full_name', reg.full_name, 'email', reg.email,
      'student_id', reg.student_id, 'year_level', reg.now_year,
      'registered_at', reg.registered_at, 'by_staff', reg.registered_by is not null,
      'flags', (
        select coalesce(jsonb_agg(f), '[]'::jsonb) from (
          select 'no_student_id' as f where nullif(trim(coalesce(reg.student_id,'')),'') is null
          union all select 'no_year' where reg.now_year is null
          union all select 'center_changed' where reg.medical_center_id is distinct from reg.now_center
          union all select 'year_mismatch' where array_length(s.years,1) is not null
                                             and (reg.ynum is null or not (reg.ynum = any(s.years)))
        ) x)
    ) as row, reg.full_name as sort_name from reg
  ),
  missing as (
    select jsonb_build_object(
      'user_id', sc.id, 'full_name', sc.full_name, 'email', sc.email,
      'student_id', sc.student_id, 'year_level', sc.year_level
    ) as row, sc.full_name as sort_name
    from scoped sc
    where not exists (select 1 from reg where reg.user_id = sc.id)
  )
  select jsonb_build_object(
    'exam', jsonb_build_object(
      'exam_key', s.exam_key, 'title', s.title, 'kind', s.kind,
      'starts_at', s.starts_at, 'register_closes_at', s.register_closes_at,
      'years', to_jsonb(s.years), 'closed', now() >= s.register_closes_at),
    'center', jsonb_build_object('id', v_center, 'name', v_center_name),
    'summary', jsonb_build_object(
      'eligible', (select count(*) from scoped),
      'registered', (select count(*) from reg),
      'by_staff', (select count(*) from reg where registered_by is not null),
      'not_registered', (select count(*) from missing),
      'needs_check', (select count(*) from reg_rows where jsonb_array_length(row->'flags') > 0),
      'cancelled', (select count(*) from public.exam_registrations r2 join elig e2 on e2.id = r2.user_id
                    where r2.exam_key = _exam_key and r2.cancelled_at is not null)),
    'registered', (select coalesce(jsonb_agg(row order by sort_name nulls last), '[]'::jsonb) from reg_rows),
    'not_registered', (select coalesce(jsonb_agg(row order by sort_name nulls last), '[]'::jsonb) from missing)
  ) into result;

  return result;
end $function$;
