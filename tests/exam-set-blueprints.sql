begin;
do $$
declare uid uuid; sid bigint; msid bigint; cid uuid; cid2 uuid; row1 bigint; row2 bigint; bi bigint; bv bigint; a jsonb; rejected boolean;
begin
 select user_id into uid from public.admin_grants where kind='super_admin' and revoked_at is null and (expires_at is null or expires_at>now()) limit 1;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 insert into public.exam_sets(name,created_by,blueprint) values('Synthetic TOS check',uid,'{"version":1,"rowField":"nl_domain_code","columnField":"physician_task","cells":[{"row":"TEST","column":"TEST","target":1}]}') returning id into sid;
 rejected:=false;begin update public.exam_sets set status='ready' where id=sid;exception when others then rejected:=true;end;
 if not rejected then raise exception 'Empty TOS accepted';end if;
 -- Real taxonomy values satisfy bank foreign keys.
 insert into public.bank_items(type,status,author_id,nl_domain_code,physician_task) values('mcq','approved',uid,(select code from public.nl_domains limit 1),(select code from public.physician_tasks limit 1)) returning id into bi;
 insert into public.bank_item_versions(item_id,version_no,stem,created_by) values(bi,1,'Synthetic question',uid) returning id into bv;
 update public.bank_items set current_version_id=bv where id=bi;
 insert into public.bank_item_options(version_id,label,body,is_correct,order_index) values(bv,'A','One',true,0),(bv,'B','Two',false,1);
 insert into public.exam_set_items(exam_set_id,item_id,position,points) values(sid,bi,1,2.5);
 update public.exam_sets set blueprint=jsonb_build_object('version',1,'rowField','nl_domain_code','columnField','physician_task','cells',jsonb_build_array(jsonb_build_object('row',(select nl_domain_code from public.bank_items where id=bi),'column',(select physician_task from public.bank_items where id=bi),'target',1))) where id=sid;
 update public.exam_sets set status='ready' where id=sid;
 a:=public.delivery_manage('create',jsonb_build_object('title','Synthetic MCQ publish','kind','mcq','source_id',sid,'duration_min',10,'attempts_allowed',1,'pass_mark',50));
 perform public.delivery_manage('publish',jsonb_build_object('id',a->>'id'));
 if (select (paper->0->>'points')::numeric from exam_delivery.exams where id=(a->>'id')::uuid)<>2.5 then raise exception 'Lost MCQ points';end if;
 update public.exam_set_items set points=3 where exam_set_id=sid;
 if (select status from public.exam_sets where id=sid)<>'draft' then raise exception 'Edit did not invalidate readiness';end if;
 insert into public.meq_cases(author_id,title,academic_year,document) values(uid,'Synthetic case 1',2568,'{"version":1,"stages":[{"title":"One","scenario":"Test","minutes":5,"questions":[{"id":"same","prompt":"Test","points":2,"modelAnswer":"Test","rubric":"Test"}]}]}') returning id into cid;
 insert into public.meq_cases(author_id,title,academic_year,document) select uid,'Synthetic case 2',2568,document from public.meq_cases where id=cid returning id into cid2;
 insert into public.exam_sets(name,created_by,kind) values('Synthetic MEQ set',uid,'meq') returning id into msid;
 insert into public.exam_set_cases(exam_set_id,case_id,position) values(msid,cid,1) returning id into row1;
 insert into public.exam_set_cases(exam_set_id,case_id,position) values(msid,cid2,2) returning id into row2;
 perform public.reorder_exam_set(msid,array[row2,row1]);
 if (select case_id from public.exam_set_cases where exam_set_id=msid order by position limit 1)<>cid2 then raise exception 'Reorder failed';end if;
 update public.exam_sets set status='ready' where id=msid;
 a:=public.delivery_manage('create',jsonb_build_object('title','Synthetic MEQ publish','kind','meq','source_id','set:'||msid,'duration_min',10,'attempts_allowed',1,'pass_mark',50));
 perform public.delivery_manage('publish',jsonb_build_object('id',a->>'id'));
 if (select jsonb_array_length(paper)<>2 or duration_min<>10 or paper->0->'questions'->0->>'id'=paper->1->'questions'->0->>'id' from exam_delivery.exams where id=(a->>'id')::uuid) then raise exception 'MEQ composition failed';end if;
 rejected:=false;begin insert into public.exam_set_cases(exam_set_id,case_id,position) values(sid,cid,1);exception when others then rejected:=true;end;
 if not rejected then raise exception 'Cross-kind item accepted';end if;
end $$;
rollback;
