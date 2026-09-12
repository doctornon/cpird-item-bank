-- Synthetic fixtures exist only inside this rolled-back transaction.
begin;
do $$
declare uid uuid; eid uuid; aid uuid; a jsonb; b jsonb; rejected boolean;
begin
 select id into uid from auth.users limit 1;
 if uid is null then raise exception 'Requires an existing auth user for FK checks'; end if;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 insert into exam_delivery.exams(created_by,title,kind,source_id,status,duration_min,attempts_allowed,pass_mark,show_score,show_answers,paper)
 values(uid,'temporary MEQ engine check','meq','test-only','open',10,1,50,false,false,
 '[{"title":"Synthetic stage 1","minutes":5,"scenario":"Test scenario one","questions":[{"id":"s1","prompt":"Input one","points":2,"modelAnswer":"private answer one","rubric":"private rubric one"}]},{"title":"Synthetic stage 2","minutes":5,"scenario":"Hidden future scenario","questions":[{"id":"s2","prompt":"Input two","points":3,"modelAnswer":"private answer two","rubric":"private rubric two"}]}]') returning id into eid;
 a:=public.delivery_run('start',jsonb_build_object('id',eid)); aid:=(a->>'id')::uuid;
 if a::text like '%private%' or a::text like '%Hidden future%' then raise exception 'MEQ content leaked'; end if;
 b:=public.delivery_run('save',jsonb_build_object('attempt_id',aid,'revision',99,'stage',0,'answers',jsonb_build_object('s1','bad stale')));
 if not (b->>'conflict')::boolean then raise exception 'stale write accepted'; end if;
 a:=public.delivery_run('advance',jsonb_build_object('attempt_id',aid,'revision',a->'revision','stage',0,'answers',jsonb_build_object('s1','saved one')));
 if a->>'stage'<>'1' or a->'answers'->>'s1'<>'saved one' or a::text like '%private%' then raise exception 'advance failed'; end if;
 rejected:=false;
 begin perform public.delivery_run('save',jsonb_build_object('attempt_id',aid,'revision',a->'revision','stage',1,'answers',jsonb_build_object('s1','late edit'))); exception when others then rejected:=true; end;
 if not rejected then raise exception 'previous stage editable'; end if;
 a:=public.delivery_run('submit',jsonb_build_object('attempt_id',aid,'revision',a->'revision','stage',1,'answers',jsonb_build_object('s2','saved two')));
 if a->>'status'<>'awaiting_grade' or a->>'score' is not null or a->'paper'<>'[]'::jsonb then raise exception 'MEQ result failure'; end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 rejected:=false;
 begin perform public.delivery_run('paper',jsonb_build_object('attempt_id',aid)); exception when others then rejected:=true; end;
 if not rejected then raise exception 'other user access'; end if;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 insert into exam_delivery.exams(created_by,title,kind,source_id,status,duration_min,attempts_allowed,pass_mark,show_score,show_answers,allow_back,paper)
 values(uid,'temporary MCQ engine check','mcq','test-only','open',10,1,50,false,false,false,
 '[{"id":"a","stem":"First synthetic","points":1,"options":[{"id":"A","body":"First","correct":true},{"id":"B","body":"Second","correct":false}]},{"id":"b","stem":"Future synthetic","points":1,"options":[{"id":"A","body":"First","correct":false},{"id":"B","body":"Second","correct":true}]}]') returning id into eid;
 a:=public.delivery_run('start',jsonb_build_object('id',eid)); aid:=(a->>'id')::uuid;
 if a::text like '%correct%' or a::text like '%Future synthetic%' then raise exception 'MCQ leak'; end if;
 b:=public.delivery_run('start',jsonb_build_object('id',eid));
 if b->>'id'<>aid::text then raise exception 'duplicate start'; end if;
 a:=public.delivery_run('advance',jsonb_build_object('attempt_id',aid,'revision',a->'revision','answers',jsonb_build_object('a','A')));
 rejected:=false;
 begin perform public.delivery_run('save',jsonb_build_object('attempt_id',aid,'revision',a->'revision','answers',jsonb_build_object('b','Z'))); exception when others then rejected:=true; end;
 if not rejected then raise exception 'invalid option accepted'; end if;
 a:=public.delivery_run('submit',jsonb_build_object('attempt_id',aid,'revision',a->'revision','answers',jsonb_build_object('b','B')));
 if a->>'score' is not null or a->'paper'<>'[]'::jsonb then raise exception 'hidden score or answer leak'; end if;
 if (select score from exam_delivery.attempts where id=aid)<>2 then raise exception 'MCQ grading wrong'; end if;
 -- Repeated submission cannot change the grade.
 b:=public.delivery_run('submit',jsonb_build_object('attempt_id',aid,'revision',0,'answers',jsonb_build_object('b','A')));
 if (select score from exam_delivery.attempts where id=aid)<>2 then raise exception 'submission not idempotent'; end if;
 rejected:=false;
 begin perform public.delivery_run('start',jsonb_build_object('id',eid)); exception when others then rejected:=true; end;
 if not rejected then raise exception 'attempt limit bypass'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 rejected:=false;
 begin perform public.delivery_run('list'); exception when others then rejected:=true; end;
 if not rejected then raise exception 'anonymous access'; end if;
 if has_table_privilege('authenticated','exam_delivery.attempts','SELECT') or has_function_privilege('authenticated','exam_delivery.finish(uuid)','EXECUTE') or has_function_privilege('anon','public.delivery_run(text,jsonb)','EXECUTE') then raise exception 'privilege leak'; end if;
end $$;
rollback;
