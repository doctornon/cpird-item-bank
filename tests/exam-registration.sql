-- ข้อมูลสังเคราะห์อยู่ในทรานแซกชันที่ถูก rollback เท่านั้น ไม่มีอะไรตกค้าง
-- ตรวจว่าเดดไลน์และเงื่อนไขชั้นปีถูกบังคับที่เซิร์ฟเวอร์ ไม่ใช่แค่ซ่อนปุ่มในหน้าเว็บ
begin;
do $$
declare stu uuid; v_c bigint; res jsonb; dash jsonb; rejected boolean; staff uuid;
begin
  select id, medical_center_id into stu, v_c from public.profiles
   where role='student' and medical_center_id is not null and year_level='Y4' limit 1;
  if stu is null then raise exception 'ต้องมีนักศึกษาปี 4 ที่ผูกศูนย์ไว้เพื่อทดสอบ'; end if;
  perform set_config('request.jwt.claim.sub', stu::text, true);

  res := public.exam_register('prenle-mcq-2570-am');
  if not (res->>'ok')::boolean then raise exception 'สมัครรอบของชั้นปีตนเองไม่สำเร็จ'; end if;

  -- รอบบ่ายเป็นของปี 5 ปี 4 ต้องสมัครไม่ได้
  rejected := false;
  begin perform public.exam_register('prenle-mcq-2570-pm'); exception when others then rejected := true; end;
  if not rejected then raise exception 'ปี 4 สมัครรอบของปี 5 ได้'; end if;

  -- รอบที่ไม่ระบุชั้นปีต้องสมัครได้ทุกคน
  perform public.exam_register('meq-2569');

  -- เลยกำหนดปิดรับแล้วต้องสมัครและยกเลิกเองไม่ได้
  update public.exam_schedule set register_closes_at = now() - interval '1 day' where exam_key='meq-2569';
  rejected := false;
  begin perform public.exam_register('meq-2569'); exception when others then rejected := true; end;
  if not rejected then raise exception 'สมัครได้ทั้งที่ปิดรับสมัครแล้ว'; end if;
  rejected := false;
  begin perform public.exam_register_cancel('meq-2569'); exception when others then rejected := true; end;
  if not rejected then raise exception 'ยกเลิกเองได้ทั้งที่ปิดรับสมัครแล้ว'; end if;

  -- แดชบอร์ดของศูนย์ต้องนับผู้สมัครและคืนรายชื่อผู้ที่ยังไม่สมัคร
  select id into staff from public.profiles where is_center_admin and medical_center_id = v_c limit 1;
  if staff is null then update public.profiles set is_center_admin = true where id = stu; staff := stu; end if;
  perform set_config('request.jwt.claim.sub', staff::text, true);
  dash := public.exam_center_dashboard('prenle-mcq-2570-am');
  if (dash->'summary'->>'registered')::int < 1 then
    raise exception 'แดชบอร์ดไม่นับผู้สมัคร: %', dash->'summary'; end if;
  if jsonb_typeof(dash->'not_registered') <> 'array' then
    raise exception 'แดชบอร์ดไม่คืนรายชื่อผู้ที่ยังไม่สมัคร'; end if;

  -- เจ้าหน้าที่ศูนย์ต้องเพิ่มคนได้แม้ปิดรับสมัครแล้ว
  perform public.exam_center_register('meq-2569', stu);
end $$;
rollback;
