begin;
do $$
declare uid uuid; adminid uuid; eid uuid; aid uuid; cid uuid; a jsonb; b jsonb; rejected boolean;
begin
 select id into uid from auth.users limit 1;
 select user_id into adminid from public.admin_grants where kind='super_admin' and revoked_at is null and (expires_at is null or expires_at>now()) limit 1;
 if uid is null or adminid is null then raise exception 'Requires existing test identities'; end if;
 perform set_config('request.jwt.claim.sub',adminid::text,true);
 insert into public.meq_cases(author_id,title,academic_year,exam_year,document) values(adminid,'temporary validation fixture',2568,2569,
 '{"version":1,"stages":[{"title":"Stage 1","scenario":"Synthetic first","minutes":5,"questions":[{"id":"a","prompt":"Synthetic input","points":5,"modelAnswer":"Example","rubric":"0 to 5"}]},{"title":"Stage 2","scenario":"Synthetic second","minutes":5,"questions":[{"id":"b","prompt":"Synthetic input 2","points":5,"modelAnswer":"Example","rubric":"0 to 5"}]}]}') returning id into cid;
 a:=public.delivery_manage('create',jsonb_build_object('title','temporary publish test','kind','meq','source_id',cid,'duration_min',10,'attempts_allowed',1,'pass_mark',50)); eid:=(a->>'id')::uuid;
 perform public.delivery_manage('publish',jsonb_build_object('id',eid));
 -- Published snapshot is isolated from later author changes.
 update public.meq_cases set title='Changed source' where id=cid;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 a:=public.delivery_run('start',jsonb_build_object('id',eid)); aid:=(a->>'id')::uuid;
 update exam_delivery.attempts set stage_expires_at=now()-interval '1 second' where id=aid;
 a:=public.delivery_run('paper',jsonb_build_object('attempt_id',aid));
 if a->>'stage'<>'1' or a::text like '%Synthetic first%' then raise exception 'timed advance failed'; end if;
 update exam_delivery.attempts set expires_at=now()-interval '1 second' where id=aid;
 perform public.delivery_run('list');
 if (select status from exam_delivery.attempts where id=aid)<>'awaiting_grade' then raise exception 'expiry finalization failed'; end if;
 perform set_config('request.jwt.claim.sub',adminid::text,true);
 a:=public.delivery_manage('review',jsonb_build_object('attempt_id',aid));
 rejected:=false;
 begin perform public.delivery_manage('grade',jsonb_build_object('attempt_id',aid,'grades',jsonb_build_object('a',jsonb_build_object('points',5),'b',jsonb_build_object('points',5)))); exception when others then rejected:=true; end;
 if not rejected then raise exception 'missing grade revision accepted'; end if;
 perform public.delivery_manage('grade',jsonb_build_object('attempt_id',aid,'revision',a->'revision','grades',jsonb_build_object('a',jsonb_build_object('points',4),'b',jsonb_build_object('points',3))));
 if (select score from exam_delivery.attempts where id=aid)<>7 then raise exception 'manual grading wrong'; end if;
 -- Frozen snapshot remains after close/reopen.
 perform public.delivery_manage('close',jsonb_build_object('id',eid));
 perform public.delivery_manage('publish',jsonb_build_object('id',eid));
 if (select paper->0->>'scenario' from exam_delivery.exams where id=eid)<>'Synthetic first' then raise exception 'snapshot changed'; end if;
 -- Empty MCQ sources cannot be published.
 a:=public.delivery_manage('create',jsonb_build_object('title','temporary empty source test','kind','mcq','source_id','-1','duration_min',10,'attempts_allowed',1,'pass_mark',50));
 rejected:=false;
 begin perform public.delivery_manage('publish',jsonb_build_object('id',a->>'id')); exception when others then rejected:=true; end;
 if not rejected then raise exception 'empty exam published'; end if;
end $$;
rollback;
