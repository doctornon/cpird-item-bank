-- ข้อมูลสังเคราะห์อยู่ในทรานแซกชันที่ถูก rollback เท่านั้น ไม่มีอะไรตกค้าง
-- ตรวจคณิตศาสตร์ของ public.exam_compute_item_stats กับกระดาษคำตอบที่รู้คำตอบล่วงหน้า
begin;
do $$
declare
  uid uuid; eid uuid; i1 bigint; i2 bigint;
  res jsonb; s1 public.bank_item_stats; s2 public.bank_item_stats;
  expect_rpb numeric; rejected boolean;
begin
  select id into uid from auth.users limit 1;
  if uid is null then raise exception 'ต้องมีผู้ใช้ใน auth.users เพื่อผูก foreign key'; end if;
  select id into i1 from public.bank_items where type='mcq' order by id limit 1;
  select id into i2 from public.bank_items where type='mcq' and id <> i1 order by id limit 1;
  if i2 is null then raise exception 'ต้องมีข้อสอบ MCQ ในคลังอย่างน้อย 2 ข้อ'; end if;

  perform set_config('request.jwt.claim.sub', uid::text, true);
  insert into public.exam_item_roles(user_id, role) values (uid, 'analyst')
    on conflict do nothing;

  -- ข้อ 1 ตอบถูก 2 ใน 4 คน (p = 0.5) · ข้อ 2 ตอบถูกคนเดียว (p = 0.25)
  insert into exam_delivery.exams(created_by,title,kind,source_id,status,duration_min,attempts_allowed,pass_mark,show_score,show_answers,paper)
  values(uid,'temporary item-analysis check','mcq','test-only','open',10,9,50,false,false,
    jsonb_build_array(
      jsonb_build_object('id',i1::text,'stem','Q1','points',1,'options',
        jsonb_build_array(jsonb_build_object('id','A','body','ถูก','correct',true),
                          jsonb_build_object('id','B','body','ลวงที่มีคนเลือก','correct',false),
                          jsonb_build_object('id','C','body','ลวงที่ไม่มีใครเลือก','correct',false))),
      jsonb_build_object('id',i2::text,'stem','Q2','points',1,'options',
        jsonb_build_array(jsonb_build_object('id','A','body','ถูก','correct',true),
                          jsonb_build_object('id','B','body','ลวง','correct',false)))
    )) returning id into eid;

  -- คะแนนรวมรายคน: 2, 1, 0, 0
  insert into exam_delivery.attempts(exam_id,user_id,attempt_no,status,paper,answers,submitted_at,expires_at,stage_expires_at,score,max_score)
  values
   (eid,uid,1,'submitted','[]'::jsonb,jsonb_build_object(i1::text,'A',i2::text,'A'),now(),now(),now(),2,2),
   (eid,uid,2,'submitted','[]'::jsonb,jsonb_build_object(i1::text,'A',i2::text,'B'),now(),now(),now(),1,2),
   (eid,uid,3,'submitted','[]'::jsonb,jsonb_build_object(i1::text,'B',i2::text,'B'),now(),now(),now(),0,2),
   (eid,uid,4,'submitted','[]'::jsonb,jsonb_build_object(i2::text,'B'),now(),now(),now(),0,2); -- ข้อ 1 ไม่ตอบ

  res := public.exam_compute_item_stats(eid::text);
  if (res->>'attempts')::int <> 4 then raise exception 'นับผู้ส่งผิด: %', res->>'attempts'; end if;
  if (res->>'written')::int <> 2 then raise exception 'เขียนสถิติไม่ครบ: %', res->>'written'; end if;

  select * into s1 from public.bank_item_stats where delivery_exam_id=eid and item_id=i1;
  select * into s2 from public.bank_item_stats where delivery_exam_id=eid and item_id=i2;

  -- ค่าความยากนับจากผู้เข้าสอบทั้งหมด ผู้ไม่ตอบถือว่าไม่ได้คะแนน
  if s1.p_value <> 0.5  then raise exception 'p ข้อ 1 ควรเป็น 0.5 ได้ %',  s1.p_value; end if;
  if s2.p_value <> 0.25 then raise exception 'p ข้อ 2 ควรเป็น 0.25 ได้ %', s2.p_value; end if;
  if s1.n <> 4 then raise exception 'n ควรเป็น 4 ได้ %', s1.n; end if;

  -- กลุ่มสูง/ต่ำ 27% ของ 4 คน = คนละ 1 คน คนคะแนนสูงสุดตอบถูกทั้งสองข้อ คนต่ำสุดตอบผิดทั้งคู่
  if s1.discrimination <> 1 then raise exception 'D ข้อ 1 ควรเป็น 1 ได้ %', s1.discrimination; end if;
  if s2.discrimination <> 1 then raise exception 'D ข้อ 2 ควรเป็น 1 ได้ %', s2.discrimination; end if;

  -- ตรวจ point-biserial ด้วยสูตรตำรา (M1-M0)/SD * sqrt(pq) ซึ่งเป็นคนละเส้นทางกับ corr()
  with r as (
    select case when a.answers->>i1::text = 'A' then 1 else 0 end as ok,
           (case when a.answers->>i2::text='A' then 1 else 0 end) as rest
    from exam_delivery.attempts a where a.exam_id=eid
  )
  select round(
    ((avg(rest) filter (where ok=1) - avg(rest) filter (where ok=0)) / nullif(stddev_pop(rest),0))
    * sqrt((avg(ok::numeric)) * (1 - avg(ok::numeric))), 4)
  into expect_rpb from r;
  if abs(s1.point_biserial - expect_rpb) > 0.0002 then
    raise exception 'point-biserial ข้อ 1 ไม่ตรงสูตรตำรา: corr=% formula=%', s1.point_biserial, expect_rpb;
  end if;

  -- ตัวลวงที่ไม่มีใครเลือกต้องยังปรากฏ เพื่อให้เห็นว่าตัวลวงไม่ทำงาน
  if not exists (select 1 from jsonb_array_elements(s1.distractors->'options') o
                 where o->>'label'='C' and (o->>'n')::int = 0) then
    raise exception 'ตัวลวงที่ไม่มีคนเลือกหายไปจากผลวิเคราะห์';
  end if;
  if (s1.distractors->>'omitted')::int <> 1 then
    raise exception 'ควรนับผู้ไม่ตอบข้อ 1 ได้ 1 คน ได้ %', s1.distractors->>'omitted';
  end if;

  -- KR-20 = (k/(k-1))(1 - Σpq / var) = (2/1)(1 - 0.4375/0.6875) = 0.7273
  if abs((res->>'kr20')::numeric - 0.7273) > 0.0002 then
    raise exception 'KR-20 ไม่ตรงค่าที่คำนวณมือ: %', res->>'kr20';
  end if;

  -- รอบสอบตัวอย่างต้องไม่ปนเข้าสถิติคลังข้อสอบ
  update exam_delivery.exams set is_demo=true where id=eid;
  rejected := false;
  begin perform public.exam_compute_item_stats(eid::text); exception when others then rejected := true; end;
  if not rejected then raise exception 'รอบสอบตัวอย่างถูกนำมาคิดสถิติ'; end if;
end $$;
rollback;
