-- Separate reusable exam sets and persist editable MCQ specifications. No content seed.
alter table public.exam_sets add column kind text not null default 'mcq' check(kind in ('mcq','meq'));
alter table public.exam_sets add column blueprint jsonb not null default '{"version":1,"rowField":"specialty_id","columnField":"physician_task","cells":[]}';
create table public.exam_set_cases (
 id bigint generated always as identity primary key,
 exam_set_id bigint not null references public.exam_sets(id) on delete cascade,
 case_id uuid not null references public.meq_cases(id),
 position integer not null check(position>0),
 unique(exam_set_id,case_id)
);
create index on public.exam_set_cases(case_id);
alter table public.exam_set_cases enable row level security;
grant select,insert,update,delete on public.exam_set_cases to authenticated;
grant usage,select on sequence public.exam_set_cases_id_seq to authenticated;
create policy esc_read on public.exam_set_cases for select to authenticated using(public.auth_is_super_admin() or public.exam_has_role('committee') or public.exam_has_role('registrar'));
create policy esc_write on public.exam_set_cases for all to authenticated using(public.auth_is_super_admin() or public.exam_has_role('committee')) with check(public.auth_is_super_admin() or public.exam_has_role('committee'));

create function public.validate_exam_set() returns trigger language plpgsql set search_path='' as $$
declare c jsonb; actual integer; total integer:=0; n integer; rfield text; cfield text;
begin
 if TG_OP='UPDATE' and new.kind<>old.kind then raise exception 'เปลี่ยนประเภทชุดเดิมไม่ได้ กรุณาสร้างชุดใหม่'; end if;
 if TG_OP='UPDATE' and new.blueprint is distinct from old.blueprint then new.status:='draft'; end if;
 if new.status<>'ready' then return new; end if;
 if new.kind='meq' then
  if not exists(select 1 from public.exam_set_cases where exam_set_id=new.id) then raise exception 'เลือกเคสก่อนพร้อมใช้'; end if;
  return new;
 end if;
 rfield:=new.blueprint->>'rowField'; cfield:=new.blueprint->>'columnField';
 if rfield is null or cfield is null or rfield=cfield or rfield not in ('specialty_id','nl_domain_code','physician_task','bloom_level') or cfield not in ('specialty_id','nl_domain_code','physician_task','bloom_level') then raise exception 'แกนตารางไม่ถูกต้อง'; end if;
 if jsonb_typeof(new.blueprint->'cells') is distinct from 'array' or jsonb_array_length(new.blueprint->'cells')=0 then raise exception 'กำหนด Table of Specifications ก่อนพร้อมใช้'; end if;
 if (select count(*) from jsonb_array_elements(new.blueprint->'cells'))<>(select count(distinct (value->>'row',value->>'column')) from jsonb_array_elements(new.blueprint->'cells')) then raise exception 'สัดส่วนซ้ำช่องเดิม'; end if;
 for c in select value from jsonb_array_elements(new.blueprint->'cells') loop
  if coalesce(c->>'row','')='' or coalesce(c->>'column','')='' or coalesce(c->>'target','')!~'^[1-9][0-9]*$' then raise exception 'กรอกสัดส่วนให้ครบ'; end if;
  select count(*) into actual from public.exam_set_items si join public.bank_items bi on bi.id=si.item_id where si.exam_set_id=new.id and to_jsonb(bi)->>rfield=c->>'row' and to_jsonb(bi)->>cfield=c->>'column';
  if actual<>(c->>'target')::integer then raise exception 'จำนวนข้อยังไม่ตรง Table of Specifications'; end if;
  total:=total+actual;
 end loop;
 select count(*) into n from public.exam_set_items where exam_set_id=new.id;
 if n<>total then raise exception 'มีข้อสอบนอกตาราง'; end if;
 if exists(select 1 from public.exam_set_items si join public.bank_items bi on bi.id=si.item_id where si.exam_set_id=new.id and (bi.type::text<>'mcq' or bi.status::text<>'approved' or si.points<=0)) then raise exception 'ใช้เฉพาะ MCQ ที่อนุมัติและคะแนนมากกว่า 0'; end if;
 return new;
end $$;
create trigger validate_exam_set before insert or update on public.exam_sets for each row execute function public.validate_exam_set();

create function public.exam_set_content_changed() returns trigger language plpgsql set search_path='' as $$
declare sid bigint; k text;
begin
 sid:=case when TG_OP='DELETE' then old.exam_set_id else new.exam_set_id end;
 select kind into k from public.exam_sets where id=sid for update;
 if TG_OP<>'DELETE' then
  if TG_OP='UPDATE' and new.exam_set_id<>old.exam_set_id then raise exception 'ย้ายรายการข้ามชุดไม่ได้'; end if;
  if (TG_TABLE_NAME='exam_set_cases' and k<>'meq') or (TG_TABLE_NAME='exam_set_items' and k<>'mcq') then raise exception 'ประเภทข้อสอบไม่ตรงชุด'; end if;
  if TG_TABLE_NAME='exam_set_items' then
   if new.points is null or new.points<=0 or not exists(select 1 from public.bank_items where id=new.item_id and type::text='mcq' and status::text='approved') then raise exception 'เลือกเฉพาะ MCQ ที่อนุมัติและคะแนนมากกว่า 0'; end if;
  end if;
 end if;
 update public.exam_sets set status='draft',updated_at=now() where id=sid;
 if TG_OP='DELETE' then return old; end if; return new;
end $$;
create trigger exam_set_item_changed before insert or update or delete on public.exam_set_items for each row execute function public.exam_set_content_changed();
create trigger exam_set_case_changed before insert or update or delete on public.exam_set_cases for each row execute function public.exam_set_content_changed();

create function public.reorder_exam_set(set_id bigint,ordered_ids bigint[]) returns jsonb language plpgsql security invoker set search_path='' as $$
declare k text; n int;
begin
 if auth.uid() is null or not coalesce(public.auth_is_super_admin() or public.exam_has_role('committee'),false) then raise exception 'ไม่มีสิทธิ์'; end if;
 select kind into k from public.exam_sets where id=set_id for update;
 if not found then raise exception 'ไม่พบชุด'; end if;
 if cardinality(ordered_ids) is null or cardinality(ordered_ids)<>(select count(distinct v) from unnest(ordered_ids) v) then raise exception 'ลำดับไม่ถูกต้อง'; end if;
 if k='mcq' then
  select count(*) into n from public.exam_set_items where exam_set_id=set_id;
  if n<>cardinality(ordered_ids) or exists(select 1 from unnest(ordered_ids) v where not exists(select 1 from public.exam_set_items where id=v and exam_set_id=set_id)) then raise exception 'รายการเปลี่ยนแล้ว กรุณาเปิดชุดใหม่'; end if;
  update public.exam_set_items si set position=a.ord from unnest(ordered_ids) with ordinality a(id,ord) where si.id=a.id and si.exam_set_id=set_id;
 else
  select count(*) into n from public.exam_set_cases where exam_set_id=set_id;
  if n<>cardinality(ordered_ids) or exists(select 1 from unnest(ordered_ids) v where not exists(select 1 from public.exam_set_cases where id=v and exam_set_id=set_id)) then raise exception 'รายการเปลี่ยนแล้ว กรุณาเปิดชุดใหม่'; end if;
  update public.exam_set_cases sc set position=a.ord from unnest(ordered_ids) with ordinality a(id,ord) where sc.id=a.id and sc.exam_set_id=set_id;
 end if;
 return '{"ok":true}';
end $$;
revoke all on function public.reorder_exam_set(bigint,bigint[]) from public,anon;
grant execute on function public.reorder_exam_set(bigint,bigint[]) to authenticated;

-- Finalize expired attempts when the student or examiner next reads the list.
create or replace function exam_delivery.manage(action text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e exam_delivery.exams; t exam_delivery.attempts; p jsonb; s jsonb; q jsonb; opts jsonb; r record; total numeric; pts numeric; n int;
begin
 if auth.uid() is null or not coalesce(public.auth_is_super_admin() or public.exam_has_role('committee'),false) then raise exception 'ไม่มีสิทธิ์จัดการสอบ'; end if;
 if action='list' then return coalesce((select jsonb_agg(to_jsonb(x)-'paper'-'access_code' order by x.created_at desc) from exam_delivery.exams x),'[]'); end if;
 if action='create' then
  insert into exam_delivery.exams(created_by,title,kind,source_id,instructions,center_id,open_at,close_at,duration_min,attempts_allowed,pass_mark,shuffle_questions,shuffle_options,allow_back,show_score,show_answers,access_code)
  values(auth.uid(),trim(payload->>'title'),payload->>'kind',payload->>'source_id',coalesce(payload->>'instructions',''),nullif(payload->>'center_id','')::bigint,nullif(payload->>'open_at','')::timestamptz,nullif(payload->>'close_at','')::timestamptz,
   (payload->>'duration_min')::int,(payload->>'attempts_allowed')::int,(payload->>'pass_mark')::numeric,
   coalesce((payload->>'shuffle_questions')::boolean,false),coalesce((payload->>'shuffle_options')::boolean,false),case when payload->>'kind'='meq' then false else coalesce((payload->>'allow_back')::boolean,true) end,
   coalesce((payload->>'show_score')::boolean,false),coalesce((payload->>'show_answers')::boolean,false),coalesce(payload->>'access_code','')) returning * into e;
  return to_jsonb(e)-'paper'-'access_code';
 end if;
 if action in ('review','grade') then
  select * into t from exam_delivery.attempts where id=(payload->>'attempt_id')::uuid for update;
  if not found then raise exception 'ไม่พบคำตอบ'; end if;
  select * into e from exam_delivery.exams where id=t.exam_id;
  if t.status='in_progress' then raise exception 'ผู้สอบยังไม่ส่ง'; end if;
  if action='review' then return to_jsonb(t); end if;
  if e.kind<>'meq' then raise exception 'ตรวจคะแนนเองเฉพาะ MEQ'; end if;
  if t.revision is distinct from (payload->>'revision')::int then raise exception 'ข้อมูลเปลี่ยนแล้ว กรุณาเปิดใหม่'; end if;
  total:=0;
  for s in select value from jsonb_array_elements(t.paper) loop
   for q in select value from jsonb_array_elements(s->'questions') loop
    pts:=(payload->'grades'->(q->>'id')->>'points')::numeric;
    if pts is null or pts<0 or pts>(q->>'points')::numeric then raise exception 'กรุณาตรวจคะแนนทุกข้อให้อยู่ในช่วงที่กำหนด'; end if;
    total:=total+pts;
   end loop;
  end loop;
  update exam_delivery.attempts set score=total,grades=payload->'grades',status='graded',graded_by=auth.uid(),graded_at=now(),revision=revision+1 where id=t.id;
  return jsonb_build_object('ok',true);
 end if;
 select * into e from exam_delivery.exams where id=(payload->>'id')::uuid for update;
 if not found then raise exception 'ไม่พบรอบสอบ'; end if;
 if action='roster' then
  perform exam_delivery.finish(a.id) from exam_delivery.attempts a where a.exam_id=e.id and a.status='in_progress' and now()>=a.expires_at;
  return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',p.full_name,'student_id',p.student_id,'status',a.status,'attempt_no',a.attempt_no,'started_at',a.started_at,'submitted_at',a.submitted_at,'expires_at',a.expires_at,'score',a.score,'max_score',a.max_score) order by a.started_at desc)
    from exam_delivery.attempts a left join public.profiles p on p.id=a.user_id where a.exam_id=e.id),'[]');
 end if;
 if action='close' then update exam_delivery.exams set status='closed' where id=e.id; return jsonb_build_object('ok',true); end if;
 if action<>'publish' then raise exception 'คำสั่งไม่ถูกต้อง'; end if;
 -- Reopening preserves the frozen paper so existing attempts remain comparable.
 if e.status='closed' then update exam_delivery.exams set status='open' where id=e.id; return jsonb_build_object('ok',true); end if;
 if e.status<>'draft' then raise exception 'รอบสอบเปิดแล้ว'; end if;
 p:='[]';
 if e.kind='mcq' then
  if not exists(select 1 from public.exam_sets where id=e.source_id::bigint and status='ready' and kind='mcq') then raise exception 'ชุด MCQ ต้องอยู่ในสถานะพร้อมใช้'; end if;
  for r in select si.points,bi.id,bi.type,bi.status,bv.stem,bv.rationale,bv.rationale_mode,bv.id as version_id from public.exam_set_items si join public.bank_items bi on bi.id=si.item_id join public.bank_item_versions bv on bv.id=bi.current_version_id where si.exam_set_id=e.source_id::bigint order by si.position loop
   if r.type::text<>'mcq' or r.status::text<>'approved' then raise exception 'ชุดสอบต้องมีเฉพาะ MCQ ที่อนุมัติแล้ว'; end if;
   select jsonb_agg(jsonb_build_object('id',o.label,'body',o.body,'correct',o.is_correct,'rationale',o.rationale) order by o.order_index),count(*) filter(where o.is_correct) into opts,n from public.bank_item_options o where o.version_id=r.version_id;
   if n<>1 or jsonb_array_length(opts)<2 or nullif(trim(r.stem),'') is null then raise exception 'ตรวจโจทย์และเฉลย MCQ ให้ครบก่อนเปิดสอบ'; end if;
   p:=p||jsonb_build_array(jsonb_build_object('id',r.id::text,'stem',r.stem,'points',r.points,'options',opts,'rationale',r.rationale,'rationale_mode',r.rationale_mode));
  end loop;
 else
  if e.source_id like 'set:%' then
   if not exists(select 1 from public.exam_sets where id=substring(e.source_id from 5)::bigint and kind='meq' and status='ready') then raise exception 'ชุด MEQ ต้องพร้อมใช้'; end if;
   p:='[]';
   for r in select mc.id,mc.title,mc.document from public.exam_set_cases sc join public.meq_cases mc on mc.id=sc.case_id where sc.exam_set_id=substring(e.source_id from 5)::bigint order by sc.position loop
    if coalesce(jsonb_array_length(r.document->'stages'),0)=0 then raise exception 'เคส MEQ ต้องมีตอน'; end if;
    for s in select value from jsonb_array_elements(r.document->'stages') loop
     select coalesce(jsonb_agg(jsonb_set(value,'{id}',to_jsonb(r.id::text||':'||(value->>'id'))) order by ordinality),'[]') into opts from jsonb_array_elements(s->'questions') with ordinality;
     s:=jsonb_set(s,'{questions}',opts);
     s:=s||jsonb_build_object('title',r.title||' · '||coalesce(s->>'title',''),'caseId',r.id);
     p:=p||jsonb_build_array(s);
    end loop;
   end loop;
  else
   select document->'stages' into p from public.meq_cases where id=e.source_id::uuid;
  end if;
  if p is null then raise exception 'ไม่พบเคส MEQ'; end if;
  total:=0; n:=0;
  for s in select value from jsonb_array_elements(p) loop
   if coalesce(jsonb_array_length(s->'questions'),0)=0 or coalesce((s->>'minutes')::numeric,0)<=0 or nullif(trim(s->>'scenario'),'') is null then raise exception 'ตรวจเวลา โจทย์ และคำถาม MEQ ทุกตอน'; end if;
   total:=total+(s->>'minutes')::numeric;
   for q in select value from jsonb_array_elements(s->'questions') loop
    if nullif(q->>'id','') is null or nullif(trim(q->>'prompt'),'') is null or coalesce((q->>'points')::numeric,-1)<0 or nullif(trim(q->>'modelAnswer'),'') is null or nullif(trim(q->>'rubric'),'') is null then raise exception 'MEQ ต้องมีโจทย์ คะแนน แนวคำตอบ และเกณฑ์ให้คะแนนครบทุกข้อ'; end if;
    n:=n+1;
   end loop;
  end loop;
  if n<>(select count(distinct xq.value->>'id') from jsonb_array_elements(p) xs cross join lateral jsonb_array_elements(xs.value->'questions') xq) then raise exception 'รหัสคำถาม MEQ ซ้ำ'; end if;
  update exam_delivery.exams set duration_min=ceil(total)::int,allow_back=false,shuffle_questions=false,shuffle_options=false where id=e.id;
 end if;
 if coalesce(jsonb_array_length(p),0)=0 then raise exception 'ยังไม่มีข้อสอบ จึงเปิดรอบสอบไม่ได้'; end if;
 update exam_delivery.exams set paper=p,status='open' where id=e.id;
 return jsonb_build_object('ok',true);
end $$;
