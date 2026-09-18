-- Phase 0 · ปิดช่องโหว่ bucket รูปข้อสอบ (question-images)
--
-- ปัญหาที่พบบน production:
--   นโยบาย qimg_insert / qimg_update / qimg_delete เป็น PERMISSIVE ให้ role `authenticated`
--   โดยมีเงื่อนไขเพียง bucket_id = 'question-images' ไม่มีการตรวจสิทธิ์ใด ๆ
--   เนื่องจากนโยบาย PERMISSIVE ถูก OR รวมกัน นโยบายเข้มงวดที่มีอยู่จึงไม่มีผล
--   ผลคือผู้ใช้ที่ล็อกอินคนใดก็ได้ (รวมถึงนักศึกษา เพราะใช้ฐานผู้ใช้ร่วมกับ LMS)
--   สามารถอัปโหลด ทับ หรือ "ลบ" รูปข้อสอบทุกไฟล์ได้
--
-- ขณะแก้ไข bucket นี้ยังไม่มีไฟล์ (0 objects) การรัดกุมจึงไม่กระทบผู้ใช้เดิม
-- นโยบายฝั่งผู้ดูแลของเดิม (qimg_*_admin, question_images_write_admin) คงไว้ทั้งหมด
-- เพื่อไม่ให้กระทบระบบอื่นที่ใช้โปรเจกต์ Supabase ร่วมกัน

-- 1) ถอนนโยบายที่เปิดกว้างเกินไป
drop policy if exists qimg_insert on storage.objects;
drop policy if exists qimg_update on storage.objects;
drop policy if exists qimg_delete on storage.objects;

-- 2) เปิดสิทธิ์เขียนเฉพาะกรรมการออกข้อสอบ ซึ่งเป็นผู้ใช้งานจริงของ ItemEditor
--    (นโยบายผู้ดูแลเดิมครอบคลุม admin / super admin อยู่แล้ว)
create policy qimg_write_item_staff on storage.objects
for insert to authenticated
with check (
  bucket_id = 'question-images'
  and (
    public.auth_is_super_admin()
    or exists (
      select 1 from public.exam_item_roles r
      where r.user_id = auth.uid() and r.role in ('committee', 'item_writer')
    )
  )
);

-- แก้ไข/ลบ ทำได้เฉพาะไฟล์ที่ตนอัปโหลดเอง เพื่อกันการทับไฟล์ของผู้อื่น
create policy qimg_modify_own on storage.objects
for update to authenticated
using (bucket_id = 'question-images' and owner_id = auth.uid()::text)
with check (bucket_id = 'question-images' and owner_id = auth.uid()::text);

create policy qimg_delete_own on storage.objects
for delete to authenticated
using (bucket_id = 'question-images' and owner_id = auth.uid()::text);

-- 3) จำกัดขนาดและชนิดไฟล์ เดิมไม่จำกัดทั้งคู่
--    ไม่จำกัดชนิดไฟล์ = อัปโหลด .html/.svg ได้ ซึ่งเปิดทาง stored XSS บนโดเมน storage
update storage.buckets
set file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'question-images';
