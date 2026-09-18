-- อ่านอย่างเดียว ไม่มีการเขียนข้อมูล
-- ยืนยันว่า bucket รูปข้อสอบไม่หลุดกลับไปเปิดกว้างอีก (ดู migration 20260918000000)
begin;
do $$
declare open_write int; lim bigint; mimes text[];
begin
 -- ต้องไม่มีนโยบายเขียนที่ยอมให้ผู้ใช้ล็อกอินคนใดก็ได้ ผ่านเพียงเพราะชื่อ bucket
 select count(*) into open_write from pg_policies
 where schemaname='storage' and tablename='objects'
   and cmd in ('INSERT','UPDATE','DELETE')
   and roles::text like '%authenticated%'
   and coalesce(qual,'')||coalesce(with_check,'') like '%question-images%'
   and coalesce(qual,'')||coalesce(with_check,'') not like '%auth.uid()%'
   and coalesce(qual,'')||coalesce(with_check,'') not like '%auth_is_super_admin%';
 if open_write > 0 then
  raise exception 'พบนโยบายเขียน question-images ที่ไม่ตรวจสิทธิ์ผู้ใช้ % รายการ', open_write;
 end if;

 select file_size_limit, allowed_mime_types into lim, mimes from storage.buckets where id='question-images';
 if lim is null or lim > 5*1024*1024 then raise exception 'bucket ไม่ได้จำกัดขนาดไฟล์ไว้ที่ 5 MB'; end if;
 if mimes is null or 'text/html' = any(mimes) or 'image/svg+xml' = any(mimes) then
  raise exception 'bucket ยอมรับชนิดไฟล์ที่เสี่ยง stored XSS';
 end if;
end $$;
rollback;
