-- การสมัครสอบของนักศึกษา และแดชบอร์ดตรวจความพร้อมของศูนย์
--
-- วันสอบเคยอยู่ใน lib/examSchedule.mjs แต่การเก็บไว้ในไฟล์ JS ทำให้ฐานข้อมูลไม่รู้จักวันสอบ
-- เดดไลน์รับสมัครจึงบังคับไม่ได้ เป็นเพียงการซ่อนปุ่มในหน้าเว็บ คนที่เรียก RPC ตรงยังสมัครย้อนหลังได้
-- migration นี้ย้ายตารางสอบเข้าฐานข้อมูล ทำให้มีแหล่งความจริงเดียวและบังคับเดดไลน์ได้จริง
--
-- apply บน production แล้วเมื่อ 2026-09-19

create table if not exists public.exam_schedule (
  exam_key text primary key,
  kind text not null check (kind in ('MCQ','MEQ')),
  title text not null,
  starts_at timestamptz not null,
  years smallint[] not null default '{}',
  where_text text,
  register_closes_at timestamptz not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.exam_schedule is 'รอบสอบที่ประกาศล่วงหน้า ใช้แสดงนับถอยหลังและรับสมัคร แยกจาก exam_delivery.exams ที่สร้างใกล้วันสอบ';
comment on column public.exam_schedule.years is 'ชั้นปีที่เกี่ยวข้อง ว่าง = ทุกชั้นปี';
comment on column public.exam_schedule.register_closes_at is 'ปิดรับสมัคร ปกติ 5 วันก่อนเวลาสอบ';

create table if not exists public.exam_registrations (
  id bigserial primary key,
  exam_key text not null references public.exam_schedule(exam_key) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- เก็บภาพ ณ วันสมัคร เพื่อให้เจ้าหน้าที่เห็นได้ว่าข้อมูลเปลี่ยนไปหลังสมัครหรือไม่
  medical_center_id bigint,
  year_level public.student_year_level,
  registered_by uuid references auth.users(id),
  registered_at timestamptz not null default now(),
  cancelled_at timestamptz,
  note text,
  unique (exam_key, user_id)
);
comment on column public.exam_registrations.registered_by is 'ว่าง = นักศึกษาสมัครเอง มีค่า = เจ้าหน้าที่ศูนย์เพิ่มให้';
comment on column public.exam_registrations.cancelled_at is 'ยกเลิกแล้วเก็บแถวไว้ ไม่ลบ เพื่อคงร่องรอยการสมัคร';

create index if not exists exam_registrations_key_center_idx
  on public.exam_registrations (exam_key, medical_center_id) where cancelled_at is null;

alter table public.exam_schedule enable row level security;
alter table public.exam_registrations enable row level security;

drop policy if exists exam_schedule_read on public.exam_schedule;
create policy exam_schedule_read on public.exam_schedule
  for select to authenticated using (true);

drop policy if exists exam_schedule_write on public.exam_schedule;
create policy exam_schedule_write on public.exam_schedule
  for all to authenticated
  using (public.auth_is_super_admin() or public.exam_has_role('registrar'))
  with check (public.auth_is_super_admin() or public.exam_has_role('registrar'));

-- อ่านได้: ของตนเอง, ของศูนย์ตนเอง (เจ้าหน้าที่/อาจารย์ admin ศูนย์), และผู้ดูแลส่วนกลาง
-- การเขียนทั้งหมดผ่าน RPC เท่านั้น เพื่อให้เดดไลน์และเงื่อนไขชั้นปีถูกบังคับที่เดียว
drop policy if exists exam_registrations_read on public.exam_registrations;
create policy exam_registrations_read on public.exam_registrations
  for select to authenticated using (
    user_id = (select auth.uid())
    or public.auth_is_super_admin()
    or public.exam_has_role('registrar')
    or public.exam_has_role('committee')
    or exists (
      select 1 from public.profiles me
      where me.id = (select auth.uid())
        and (me.is_center_admin or public.exam_has_role('center_staff'))
        and me.medical_center_id is not null
        and me.medical_center_id = public.exam_registrations.medical_center_id
    )
  );

-- ปิดรับสมัคร 5 วันก่อนเวลาสอบ ตามที่ประกาศ
insert into public.exam_schedule (exam_key, kind, title, starts_at, years, where_text, register_closes_at, sort_order)
values
  ('meq-2569','MEQ','สอบ MEQ',
   '2026-12-12T12:00:00+07:00', '{}', 'ตามที่ศูนย์แพทย์ของท่านประกาศ',
   '2026-12-12T12:00:00+07:00'::timestamptz - interval '5 days', 10),
  ('prenle-mcq-2570-am','MCQ','Pre-NLE MCQ · รอบเช้า (ปี 4)',
   '2027-02-13T09:00:00+07:00', '{4}', 'ตามที่ศูนย์แพทย์ของท่านประกาศ',
   '2027-02-13T09:00:00+07:00'::timestamptz - interval '5 days', 20),
  ('prenle-mcq-2570-pm','MCQ','Pre-NLE MCQ · รอบบ่าย (ปี 5)',
   '2027-02-13T13:00:00+07:00', '{5}', 'ตามที่ศูนย์แพทย์ของท่านประกาศ',
   '2027-02-13T13:00:00+07:00'::timestamptz - interval '5 days', 30)
on conflict (exam_key) do nothing;
