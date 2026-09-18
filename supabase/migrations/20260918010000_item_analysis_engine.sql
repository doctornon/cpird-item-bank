-- Phase 1 · เครื่องมือวิเคราะห์ข้อสอบรายข้อ (classical item analysis)
--
-- ตาราง public.bank_item_stats มีอยู่เดิมและถูก "อ่าน" ใน ExamSets / ItemPreview / Dashboard
-- แต่ไม่เคยมีโค้ดใดเขียนลงไป (0 แถว ณ วันที่เขียน) การจัดชุดอัตโนมัติจึงเลือกข้อโดยไม่มีสัญญาณคุณภาพ
--
-- คอลัมน์ exam_id เดิมเป็น bigint ของ engine เก่า ขณะที่ exam_delivery.exams.id เป็น uuid
-- จึงเพิ่มคอลัมน์ delivery_exam_id แยกไว้ ไม่แตะของเดิม เพื่อไม่กระทบข้อมูล legacy
--
-- migration นี้เป็นแบบเพิ่มอย่างเดียว ไม่แทนที่ฟังก์ชันที่มีอยู่ เพราะนิยามจริงบนฐานข้อมูล
-- ล้ำหน้าไฟล์ในไดเรกทอรีนี้ (ดูหัวข้อ Schema drift warning ใน README)

-- ── 1) ที่เก็บผล ──────────────────────────────────────────────────────────────
alter table public.bank_item_stats
  add column if not exists delivery_exam_id uuid references exam_delivery.exams(id) on delete cascade,
  add column if not exists point_biserial numeric;

comment on column public.bank_item_stats.delivery_exam_id is 'รอบสอบของ engine ใหม่ (exam_delivery.exams) — แยกจาก exam_id ของ engine เดิม';
comment on column public.bank_item_stats.discrimination is 'อำนาจจำแนก D = สัดส่วนตอบถูกกลุ่มสูง 27% ลบกลุ่มต่ำ 27%';
comment on column public.bank_item_stats.point_biserial is 'สหสัมพันธ์ระหว่างคะแนนข้อนี้กับคะแนนรวมที่หักข้อนี้ออกแล้ว (corrected point-biserial)';

create unique index if not exists bank_item_stats_item_delivery_uidx
  on public.bank_item_stats (item_id, delivery_exam_id)
  where delivery_exam_id is not null;

-- ความเชื่อมั่นระดับรอบสอบ เก็บแยกเพราะเป็นค่าของทั้งฉบับ ไม่ใช่ของรายข้อ
create table if not exists exam_delivery.exam_stats (
  exam_id uuid primary key references exam_delivery.exams(id) on delete cascade,
  n_attempts integer not null,
  n_items integer not null,
  mean_score numeric,
  sd_score numeric,
  kr20 numeric,
  computed_at timestamptz not null default now()
);
alter table exam_delivery.exam_stats enable row level security;
-- เข้าถึงผ่าน RPC เท่านั้น เช่นเดียวกับตารางอื่นในสกีมานี้ จึงตั้งใจไม่ประกาศ policy

-- ── 2) การคำนวณ ──────────────────────────────────────────────────────────────
-- ใช้ CTE ล้วน ไม่ใช้ temporary table เพราะฟังก์ชันตั้ง search_path เป็นค่าว่าง
create or replace function public.exam_compute_item_stats(_assignment_id text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  e exam_delivery.exams;
  v_all jsonb;
  n_att integer;
  n_items integer;
  v_sd numeric;
  v_sumpq numeric;
  v_kr20 numeric;
  n_written integer;
begin
  if not (public.auth_is_super_admin()
          or public.exam_has_role('committee')
          or public.exam_has_role('registrar')
          or public.exam_has_role('analyst')) then
    raise exception 'forbidden';
  end if;

  select * into e from exam_delivery.exams where id = _assignment_id::uuid;
  if not found then raise exception 'ไม่พบรอบสอบ'; end if;
  if e.kind <> 'mcq' then raise exception 'วิเคราะห์รายข้อรองรับเฉพาะรอบสอบ MCQ'; end if;
  -- รอบสอบตัวอย่างไม่สะท้อนความสามารถจริง จึงไม่ให้ปนเข้าสถิติคลังข้อสอบ
  if e.is_demo then raise exception 'รอบสอบตัวอย่างไม่นำมาคิดสถิติ'; end if;

  with att as (
    select a.id as attempt_id, a.answers
    from exam_delivery.attempts a
    where a.exam_id = e.id and a.submitted_at is not null
  ),
  q as (
    -- เฉลยอ่านจากกระดาษที่ freeze ไว้ที่รอบสอบ ป้ายตัวเลือกคงที่แม้สลับลำดับรายคน
    select (x.q->>'id') as item_id,
           (select o->>'id' from jsonb_array_elements(x.q->'options') o
             where (o->>'correct')::boolean limit 1) as correct_label
    from jsonb_array_elements(e.paper) as x(q)
  ),
  resp as (
    select att.attempt_id,
           q.item_id,
           nullif(att.answers->>q.item_id, '') as chosen,
           (case when att.answers->>q.item_id = q.correct_label then 1 else 0 end) as ok
    from att cross join q
  ),
  tot as (
    select attempt_id, sum(ok)::numeric as total from resp group by attempt_id
  ),
  gsize as (
    -- กลุ่มสูง/ต่ำ 27% ตามแนวปฏิบัติมาตรฐานของ classical item analysis
    select greatest(1, floor(count(*) * 0.27))::int as k from tot
  ),
  hi as (select attempt_id from tot order by total desc, attempt_id limit (select k from gsize)),
  lo as (select attempt_id from tot order by total asc,  attempt_id limit (select k from gsize)),
  band as (
    select r.item_id,
           round(avg(r.ok::numeric) filter (where h.attempt_id is not null)
               - avg(r.ok::numeric) filter (where l.attempt_id is not null), 4) as discrimination
    from resp r
    left join hi h on h.attempt_id = r.attempt_id
    left join lo l on l.attempt_id = r.attempt_id
    group by r.item_id
  ),
  opts as (
    select (x.q->>'id') as item_id, o->>'id' as label, (o->>'correct')::boolean as is_correct
    from jsonb_array_elements(e.paper) as x(q), jsonb_array_elements(x.q->'options') o
  ),
  picked as (
    select item_id, chosen as label, count(*)::int as n
    from resp where chosen is not null group by item_id, chosen
  ),
  omitted as (
    select item_id, count(*) filter (where chosen is null)::int as n from resp group by item_id
  ),
  dist as (
    -- ไล่จากรายการตัวเลือกทั้งหมด ตัวลวงที่ไม่มีใครเลือกจึงยังปรากฏด้วย n = 0
    select o.item_id,
           jsonb_build_object(
             'omitted', coalesce(max(om.n), 0),
             'options', jsonb_agg(
               jsonb_build_object(
                 'label', o.label,
                 'correct', o.is_correct,
                 'n', coalesce(p.n, 0),
                 'pct', round(100.0 * coalesce(p.n, 0) / nullif((select count(*) from att), 0), 1)
               ) order by o.label)
           ) as distractors
    from opts o
    left join picked p on p.item_id = o.item_id and p.label = o.label
    left join omitted om on om.item_id = o.item_id
    group by o.item_id
  ),
  item as (
    select r.item_id,
           count(*)::int as n,
           sum(r.ok)::int as n_correct,
           count(*) filter (where r.chosen is not null)::int as n_answered,
           round(sum(r.ok)::numeric / count(*), 4) as p_value,
           -- หักคะแนนข้อนี้ออกจากคะแนนรวมก่อนหาสหสัมพันธ์ กันไม่ให้ข้อสัมพันธ์กับตัวเอง
           round(corr(r.ok::numeric, t.total - r.ok)::numeric, 4) as point_biserial,
           b.discrimination
    from resp r
    join tot t on t.attempt_id = r.attempt_id
    left join band b on b.item_id = r.item_id
    group by r.item_id, b.discrimination
  )
  select jsonb_build_object(
    'n_att',  (select count(*) from att),
    'n_items',(select count(*) from q),
    'mean',   (select round(avg(total), 4) from tot),
    'sd',     (select round(stddev_pop(total), 4) from tot),
    'items',  (select coalesce(jsonb_agg(to_jsonb(i) || jsonb_build_object('distractors', coalesce(d.distractors, '{}'::jsonb))), '[]'::jsonb)
                 from item i left join dist d on d.item_id = i.item_id)
  ) into v_all;

  n_att   := (v_all->>'n_att')::int;
  n_items := (v_all->>'n_items')::int;
  v_sd    := (v_all->>'sd')::numeric;
  if coalesce(n_att, 0) = 0 then raise exception 'ยังไม่มีผู้ส่งข้อสอบในรอบนี้'; end if;

  select sum(p * (1 - p)) into v_sumpq
  from (select (x->>'p_value')::numeric as p from jsonb_array_elements(v_all->'items') x) s;

  if n_items > 1 and v_sd is not null and v_sd > 0 then
    v_kr20 := round((n_items::numeric / (n_items - 1)) * (1 - v_sumpq / (v_sd * v_sd)), 4);
  end if;

  insert into public.bank_item_stats
    (item_id, delivery_exam_id, n, p_value, discrimination, point_biserial, distractors, computed_at)
  select r.item_id::bigint, e.id, r.n, r.p_value, r.discrimination, r.point_biserial, r.distractors, now()
  from jsonb_to_recordset(v_all->'items') as r(
    item_id text, n int, p_value numeric, discrimination numeric, point_biserial numeric, distractors jsonb)
  where r.item_id ~ '^[0-9]+$'
    and exists (select 1 from public.bank_items b where b.id = r.item_id::bigint)
  on conflict (item_id, delivery_exam_id) where delivery_exam_id is not null
  do update set n = excluded.n,
                p_value = excluded.p_value,
                discrimination = excluded.discrimination,
                point_biserial = excluded.point_biserial,
                distractors = excluded.distractors,
                computed_at = excluded.computed_at;
  get diagnostics n_written = row_count;

  insert into exam_delivery.exam_stats (exam_id, n_attempts, n_items, mean_score, sd_score, kr20, computed_at)
  values (e.id, n_att, n_items, (v_all->>'mean')::numeric, v_sd, v_kr20, now())
  on conflict (exam_id) do update set n_attempts = excluded.n_attempts,
                                      n_items    = excluded.n_items,
                                      mean_score = excluded.mean_score,
                                      sd_score   = excluded.sd_score,
                                      kr20       = excluded.kr20,
                                      computed_at= excluded.computed_at;

  return jsonb_build_object('ok', true, 'attempts', n_att, 'items', n_items,
                            'written', n_written, 'mean', (v_all->>'mean')::numeric,
                            'sd', v_sd, 'kr20', v_kr20);
end
$function$;

-- หมายเหตุ: คำสั่ง revoke/grant ในไฟล์นี้ยังไม่ได้ apply บน production
-- เครื่องมือที่ใช้ปฏิเสธคำสั่งเปลี่ยนสิทธิ์ ฟังก์ชันทั้งสองจึงยังมี EXECUTE ติดมากับ PUBLIC และ anon
-- ตัวฟังก์ชันมีด่านตรวจบทบาทในตัวอยู่แล้ว ผู้ไม่มีสิทธิ์จะได้ข้อผิดพลาด 'forbidden'
-- จึงไม่ใช่ช่องโหว่ แต่ควรรันคำสั่งเหล่านี้เพื่อให้ตรงแบบแผนเดียวกับ RPC อื่นของโปรเจกต์
-- (delivery_manage / delivery_run / exam_attempt_rows ให้สิทธิ์เฉพาะ authenticated + service_role)
revoke all on function public.exam_compute_item_stats(text) from public, anon;
grant execute on function public.exam_compute_item_stats(text) to authenticated;

-- ── 3) การอ่านผล ─────────────────────────────────────────────────────────────
create or replace function public.exam_item_stats(_assignment_id text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare e exam_delivery.exams; s exam_delivery.exam_stats; rows jsonb;
begin
  if not (public.auth_is_super_admin()
          or public.exam_has_role('committee')
          or public.exam_has_role('registrar')
          or public.exam_has_role('analyst')) then
    raise exception 'forbidden';
  end if;

  select * into e from exam_delivery.exams where id = _assignment_id::uuid;
  if not found then raise exception 'ไม่พบรอบสอบ'; end if;
  select * into s from exam_delivery.exam_stats where exam_id = e.id;

  select coalesce(jsonb_agg(x.row order by (x.row->>'p_value')::numeric nulls last), '[]'::jsonb) into rows
  from (
    select jsonb_build_object(
      'item_id', st.item_id,
      'stem', bv.stem,
      'status', bi.status,
      'n', st.n,
      'p_value', st.p_value,
      'discrimination', st.discrimination,
      'point_biserial', st.point_biserial,
      'distractors', st.distractors
    ) as row
    from public.bank_item_stats st
    join public.bank_items bi on bi.id = st.item_id
    left join public.bank_item_versions bv on bv.id = bi.current_version_id
    where st.delivery_exam_id = e.id
  ) x;

  return jsonb_build_object(
    'exam', jsonb_build_object('id', e.id, 'title', e.title, 'kind', e.kind),
    'summary', case when s.exam_id is null then null else jsonb_build_object(
      'attempts', s.n_attempts, 'items', s.n_items,
      'mean', s.mean_score, 'sd', s.sd_score, 'kr20', s.kr20,
      'computed_at', s.computed_at) end,
    'items', rows
  );
end
$function$;

revoke all on function public.exam_item_stats(text) from public, anon;
grant execute on function public.exam_item_stats(text) to authenticated;
