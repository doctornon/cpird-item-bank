-- RPC ของการสมัครสอบ เดดไลน์และเงื่อนไขชั้นปีถูกบังคับที่นี่ที่เดียว
-- ตาราง exam_registrations เปิดสิทธิ์ให้ select เท่านั้น การเขียนต้องผ่านฟังก์ชันเหล่านี้
-- apply บน production แล้วเมื่อ 2026-09-19

create or replace function public.exam_register(_exam_key text)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare s public.exam_schedule; me public.profiles; y smallint;
begin
  select * into me from public.profiles where id = (select auth.uid());
  if not found then raise exception 'ไม่พบบัญชีผู้ใช้'; end if;

  select * into s from public.exam_schedule where exam_key = _exam_key and active;
  if not found then raise exception 'ไม่พบรอบสอบนี้'; end if;
  if now() >= s.register_closes_at then
    raise exception 'ปิดรับสมัครรอบนี้แล้ว (ปิดเมื่อ %) กรุณาติดต่อเจ้าหน้าที่ศูนย์แพทย์',
      to_char(s.register_closes_at at time zone 'Asia/Bangkok', 'DD/MM/YYYY HH24:MI');
  end if;

  y := nullif(substring(me.year_level::text from 2), '')::smallint;
  if array_length(s.years, 1) is not null and (y is null or not (y = any(s.years))) then
    raise exception 'รอบสอบนี้สำหรับชั้นปีที่กำหนดไว้เท่านั้น';
  end if;

  insert into public.exam_registrations (exam_key, user_id, medical_center_id, year_level)
  values (_exam_key, me.id, me.medical_center_id, me.year_level)
  on conflict (exam_key, user_id) do update
    set cancelled_at = null,
        medical_center_id = excluded.medical_center_id,
        year_level = excluded.year_level,
        registered_at = now();

  return jsonb_build_object('ok', true, 'exam_key', _exam_key);
end $function$;

-- ยกเลิกเองได้ก่อนปิดรับสมัคร หลังจากนั้นต้องผ่านเจ้าหน้าที่ เพื่อให้รายชื่อสนามสอบนิ่ง
create or replace function public.exam_register_cancel(_exam_key text)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare s public.exam_schedule;
begin
  select * into s from public.exam_schedule where exam_key = _exam_key;
  if not found then raise exception 'ไม่พบรอบสอบนี้'; end if;
  if now() >= s.register_closes_at then
    raise exception 'ปิดรับสมัครแล้ว ยกเลิกเองไม่ได้ กรุณาติดต่อเจ้าหน้าที่ศูนย์แพทย์';
  end if;
  update public.exam_registrations set cancelled_at = now()
   where exam_key = _exam_key and user_id = (select auth.uid()) and cancelled_at is null;
  return jsonb_build_object('ok', true);
end $function$;

-- เจ้าหน้าที่ศูนย์เพิ่ม/นำออกนักศึกษาของศูนย์ตนเองได้ รวมถึงหลังปิดรับสมัคร
create or replace function public.exam_center_register(_exam_key text, _user_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare me public.profiles; target public.profiles; s public.exam_schedule;
begin
  select * into me from public.profiles where id = (select auth.uid());
  select * into target from public.profiles where id = _user_id;
  if not found or target.id is null then raise exception 'ไม่พบนักศึกษา'; end if;
  select * into s from public.exam_schedule where exam_key = _exam_key and active;
  if not found then raise exception 'ไม่พบรอบสอบนี้'; end if;

  if not (public.auth_is_super_admin() or public.exam_has_role('registrar')
          or ((me.is_center_admin or public.exam_has_role('center_staff'))
              and me.medical_center_id is not null
              and me.medical_center_id = target.medical_center_id)) then
    raise exception 'เพิ่มได้เฉพาะนักศึกษาในศูนย์ของท่าน';
  end if;

  insert into public.exam_registrations (exam_key, user_id, medical_center_id, year_level, registered_by)
  values (_exam_key, target.id, target.medical_center_id, target.year_level, me.id)
  on conflict (exam_key, user_id) do update
    set cancelled_at = null, registered_by = excluded.registered_by, registered_at = now();
  return jsonb_build_object('ok', true);
end $function$;

create or replace function public.exam_center_unregister(_exam_key text, _user_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare me public.profiles; target public.profiles;
begin
  select * into me from public.profiles where id = (select auth.uid());
  select * into target from public.profiles where id = _user_id;
  if not found then raise exception 'ไม่พบนักศึกษา'; end if;
  if not (public.auth_is_super_admin() or public.exam_has_role('registrar')
          or ((me.is_center_admin or public.exam_has_role('center_staff'))
              and me.medical_center_id is not null
              and me.medical_center_id = target.medical_center_id)) then
    raise exception 'จัดการได้เฉพาะนักศึกษาในศูนย์ของท่าน';
  end if;
  update public.exam_registrations set cancelled_at = now()
   where exam_key = _exam_key and user_id = _user_id and cancelled_at is null;
  return jsonb_build_object('ok', true);
end $function$;
