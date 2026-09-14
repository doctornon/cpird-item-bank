-- Contract test: the RPCs and table columns the frontend calls must exist in the DB.
-- Read-only. Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/contract.sql
do $$
declare missing text := '';
  fns text[] := array['exam_my_access','exam_writer_my','exam_writer_apply','exam_writer_decide','exam_writer_cancel',
    'exam_remove_from_system','exam_writer_list','exam_user_accounts','exam_set_access','exam_set_user_role','exam_set_user_center',
    'exam_create_invite','exam_redeem_invite','student_consent_my','student_consent_accept',
    'center_students_list','center_set_student_access','center_claim_student','center_exam_rounds',
    'delivery_run','delivery_manage','exam_attempt_rows','exam_item_analysis','exam_roster','profile_names','search_profiles'];
  cols text[] := array['exam_writer_applications:consent_at','exam_writer_applications:research_consent','exam_writer_applications:status',
    'exam_student_consent:consent_at','exam_student_consent:research_consent',
    'item_notifications:recipient_id','item_notifications:read_at','item_notifications:item_id',
    'bank_items:author_id','bank_items:status','profiles:medical_center_id','profiles:role'];
  f text; col text;
begin
  foreach f in array fns loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=f)
      then missing := missing || 'RPC ' || f || '; '; end if;
  end loop;
  foreach col in array cols loop
    if not exists (select 1 from information_schema.columns c where c.table_schema='public'
        and c.table_name=split_part(col,':',1) and c.column_name=split_part(col,':',2))
      then missing := missing || 'COLUMN ' || col || '; '; end if;
  end loop;
  if missing<>'' then raise exception 'CONTRACT FAIL: %', missing; end if;
  raise notice 'contract: all % RPCs and % columns present — PASS', array_length(fns,1), array_length(cols,1);
end $$;
