-- Phase 3 · ส่งรูปภาพของเคส MEQ ไปถึงหน้าจอผู้สอบ
--
-- ตอนเปิดรอบสอบ exam_delivery.manage คัดลอก stage ทั้งก้อนเข้ากระดาษ ฟิลด์ images จึงติดไปเอง
-- แต่ตอนส่งให้ผู้สอบ exam_delivery.run สร้าง object ใหม่แบบ whitelist โดยเลือกเฉพาะ
-- title / scenario / questions{id,prompt,points} รูปภาพจึงถูกตัดทิ้งเสมอ
--
-- ฟังก์ชัน run บนฐานข้อมูลจริงล้ำหน้าไฟล์ในไดเรกทอรีนี้มาก (ดู Schema drift warning ใน README)
-- การเขียน create or replace ทับจากไฟล์เก่าจะย้อนงานที่ทำไปแล้วทิ้ง
-- migration นี้จึงอ่านนิยามจริงจาก pg_get_functiondef แล้วแทนที่เฉพาะสองข้อความที่ต้องแก้
-- ไบต์อื่นทั้งหมดคงเดิม และถ้าหาข้อความไม่พบจะยกเลิกทั้งรายการแทนที่จะเขียนทับมั่ว
--
-- ตรวจแล้วว่าทั้งสองข้อความปรากฏเพียงแห่งละหนึ่งครั้ง

do $patch$
declare src text; out text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'exam_delivery' and p.proname = 'run';
  if src is null then raise exception 'ไม่พบฟังก์ชัน exam_delivery.run'; end if;

  -- รูปประกอบรายคำถาม
  out := replace(src,
    $f1$'points',x.q->'points') order by x.ord$f1$,
    $r1$'points',x.q->'points','images',coalesce(x.q->'images','[]'::jsonb)) order by x.ord$r1$);

  -- รูปประกอบของตอน เช่น ฟิล์ม ผลแล็บ ภาพผู้ป่วย
  out := replace(out,
    $f2$'scenario',s->>'scenario','questions',opts)$f2$,
    $r2$'scenario',s->>'scenario','images',coalesce(s->'images','[]'::jsonb),'questions',opts)$r2$);

  if out = src then raise exception 'ไม่พบข้อความที่ต้องแก้ ฟังก์ชันอาจถูกเปลี่ยนไปแล้ว'; end if;
  if position($c$'images',coalesce(s->'images'$c$ in out) = 0 then raise exception 'แก้ภาพระดับตอนไม่สำเร็จ'; end if;
  if position($c$'images',coalesce(x.q->'images'$c$ in out) = 0 then raise exception 'แก้ภาพระดับคำถามไม่สำเร็จ'; end if;

  execute out;
end
$patch$;
