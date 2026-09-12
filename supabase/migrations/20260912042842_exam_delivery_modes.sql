-- Structure only. No exam content or student records are seeded.
create schema if not exists exam_delivery;
revoke all on schema exam_delivery from public, anon;
grant usage on schema exam_delivery to authenticated;
create table exam_delivery.exams (
 id uuid primary key default gen_random_uuid(), created_by uuid not null references auth.users(id),
 title text not null check(length(trim(title)) between 1 and 300), kind text not null check(kind in ('mcq','meq')),
 source_id text not null, instructions text not null default '', status text not null default 'draft' check(status in ('draft','open','closed')),
 center_id bigint references public.medical_centers(id), open_at timestamptz, close_at timestamptz,
 duration_min integer not null check(duration_min between 1 and 1440), attempts_allowed integer not null check(attempts_allowed between 1 and 100),
 pass_mark numeric not null check(pass_mark between 0 and 100), shuffle_questions boolean not null default false, shuffle_options boolean not null default false,
 allow_back boolean not null default true, show_score boolean not null default false, show_answers boolean not null default false,
 access_code text not null default '', paper jsonb not null default '[]', created_at timestamptz not null default now(),
 check(close_at is null or open_at is null or close_at>open_at)
);
create table exam_delivery.attempts (
 id uuid primary key default gen_random_uuid(), exam_id uuid not null references exam_delivery.exams(id),
 user_id uuid not null references auth.users(id), attempt_no integer not null,
 status text not null default 'in_progress' check(status in ('in_progress','submitted','awaiting_grade','graded')),
 paper jsonb not null, answers jsonb not null default '{}', flags jsonb not null default '{}',
 current_stage integer not null default 0, started_at timestamptz not null default now(), expires_at timestamptz not null,
 stage_expires_at timestamptz not null, submitted_at timestamptz, score numeric, max_score numeric,
 grades jsonb not null default '{}', graded_by uuid references auth.users(id), graded_at timestamptz,
 revision integer not null default 0, unique(exam_id,user_id,attempt_no)
);
create index delivery_attempts_user on exam_delivery.attempts(user_id,exam_id);
create index delivery_exams_creator on exam_delivery.exams(created_by);
create index delivery_exams_center on exam_delivery.exams(center_id);
create index delivery_attempts_grader on exam_delivery.attempts(graded_by);
alter table exam_delivery.exams enable row level security;
alter table exam_delivery.attempts enable row level security;
revoke all on all tables in schema exam_delivery from public,anon,authenticated;

create function exam_delivery.manage(action text, payload jsonb) returns jsonb
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
  if t.revision<>(payload->>'revision')::int then raise exception 'ข้อมูลเปลี่ยนแล้ว กรุณาเปิดใหม่'; end if;
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
  if not exists(select 1 from public.exam_sets where id=e.source_id::bigint and status='ready') then raise exception 'ชุด MCQ ต้องอยู่ในสถานะพร้อมใช้'; end if;
  for r in select bi.id,bi.type,bi.status,bv.stem,bv.rationale,bv.rationale_mode,bv.id as version_id from public.exam_set_items si join public.bank_items bi on bi.id=si.item_id join public.bank_item_versions bv on bv.id=bi.current_version_id where si.exam_set_id=e.source_id::bigint order by si.position loop
   if r.type::text<>'mcq' or r.status::text<>'approved' then raise exception 'ชุดสอบต้องมีเฉพาะ MCQ ที่อนุมัติแล้ว'; end if;
   select jsonb_agg(jsonb_build_object('id',o.label,'body',o.body,'correct',o.is_correct,'rationale',o.rationale) order by o.order_index),count(*) filter(where o.is_correct) into opts,n from public.bank_item_options o where o.version_id=r.version_id;
   if n<>1 or jsonb_array_length(opts)<2 or nullif(trim(r.stem),'') is null then raise exception 'ตรวจโจทย์และเฉลย MCQ ให้ครบก่อนเปิดสอบ'; end if;
   p:=p||jsonb_build_array(jsonb_build_object('id',r.id::text,'stem',r.stem,'points',1,'options',opts,'rationale',r.rationale,'rationale_mode',r.rationale_mode));
  end loop;
 else
  select document->'stages' into p from public.meq_cases where id=e.source_id::uuid;
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
  if n<>(select count(distinct q->>'id') from jsonb_array_elements(p) s cross join lateral jsonb_array_elements(s->'questions') q) then raise exception 'รหัสคำถาม MEQ ซ้ำ'; end if;
  update exam_delivery.exams set duration_min=ceil(total)::int,allow_back=false,shuffle_questions=false,shuffle_options=false where id=e.id;
 end if;
 if coalesce(jsonb_array_length(p),0)=0 then raise exception 'ยังไม่มีข้อสอบ จึงเปิดรอบสอบไม่ได้'; end if;
 update exam_delivery.exams set paper=p,status='open' where id=e.id;
 return jsonb_build_object('ok',true);
end $$;

-- Internal finalization: never callable by the API role directly.
create function exam_delivery.finish(aid uuid) returns void language plpgsql set search_path='' as $$
declare t exam_delivery.attempts; e exam_delivery.exams; q jsonb; s jsonb; total numeric:=0; maximum numeric:=0;
begin
 select * into t from exam_delivery.attempts where id=aid for update;
 if t.status<>'in_progress' then return; end if;
 select * into e from exam_delivery.exams where id=t.exam_id;
 if e.kind='mcq' then
  for q in select value from jsonb_array_elements(t.paper) loop
   maximum:=maximum+(q->>'points')::numeric;
   if exists(select 1 from jsonb_array_elements(q->'options') o where (o->>'correct')::boolean and o->>'id'=t.answers->>(q->>'id')) then total:=total+(q->>'points')::numeric; end if;
  end loop;
 else
  for s in select value from jsonb_array_elements(t.paper) loop
   for q in select value from jsonb_array_elements(s->'questions') loop maximum:=maximum+(q->>'points')::numeric; end loop;
  end loop;
 end if;
 update exam_delivery.attempts set status=case when e.kind='meq' then 'awaiting_grade' else 'submitted' end,submitted_at=least(now(),expires_at),score=case when e.kind='mcq' then total else null end,max_score=maximum,revision=revision+1 where id=aid;
end $$;

create function exam_delivery.run(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare e exam_delivery.exams; t exam_delivery.attempts; uid uuid:=auth.uid(); p jsonb; q jsonb; s jsonb; v jsonb; safe jsonb; opts jsonb; kv record; n int; i int; total numeric; boundary timestamptz;
begin
 if uid is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
 if action='list' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'kind',x.kind,'instructions',x.instructions,'duration_min',x.duration_min,'open_at',x.open_at,'close_at',x.close_at,'status',x.status,'attempts_allowed',x.attempts_allowed,'allow_back',x.allow_back,'show_score',x.show_score,'show_answers',x.show_answers,'access_required',x.access_code<>'','count',jsonb_array_length(x.paper),'attempts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'attempt_no',a.attempt_no,'status',a.status,'expires_at',a.expires_at) order by a.attempt_no) from exam_delivery.attempts a where a.exam_id=x.id and a.user_id=uid),'[]')) order by x.created_at desc)
   from exam_delivery.exams x where (x.status='open' and (x.center_id is null or x.center_id=public.auth_medical_center_id())) or exists(select 1 from exam_delivery.attempts a where a.exam_id=x.id and a.user_id=uid)),'[]');
 end if;
 if action='start' then
  select * into e from exam_delivery.exams where id=(payload->>'id')::uuid for update;
  if not found then raise exception 'ไม่พบรอบสอบ'; end if;
  -- Serialize starts, including simultaneous tabs, under the same exam lock.
  select * into t from exam_delivery.attempts where exam_id=e.id and user_id=uid and status='in_progress' order by attempt_no desc limit 1 for update;
  if found then return exam_delivery.run('paper',jsonb_build_object('attempt_id',t.id)); end if;
  if e.status<>'open' or (e.open_at is not null and now()<e.open_at) or (e.close_at is not null and now()>=e.close_at) then raise exception 'อยู่นอกช่วงเปิดสอบ'; end if;
  if e.center_id is not null and e.center_id is distinct from public.auth_medical_center_id() then raise exception 'ไม่มีสิทธิ์สอบรอบนี้'; end if;
  if e.access_code<>'' and e.access_code is distinct from payload->>'code' then raise exception 'รหัสเข้าสอบไม่ถูกต้อง'; end if;
  select count(*) into n from exam_delivery.attempts where exam_id=e.id and user_id=uid;
  if n>=e.attempts_allowed then raise exception 'ครบจำนวนครั้งแล้ว'; end if;
  p:=e.paper;
  if e.kind='mcq' then
   select jsonb_agg(value order by case when e.shuffle_questions then random() else ordinality::float end) into p from jsonb_array_elements(p) with ordinality;
   safe:='[]';
   for q in select value from jsonb_array_elements(p) loop
    select jsonb_agg(value order by case when e.shuffle_options then random() else ordinality::float end) into opts from jsonb_array_elements(q->'options') with ordinality;
    safe:=safe||jsonb_build_array(jsonb_set(q,'{options}',opts));
   end loop;
   p:=safe;
  end if;
  if jsonb_array_length(p)=0 then raise exception 'ยังไม่มีข้อสอบ'; end if;
  boundary:=least(now()+make_interval(mins=>e.duration_min),coalesce(e.close_at,'infinity'::timestamptz));
  insert into exam_delivery.attempts(exam_id,user_id,attempt_no,paper,expires_at,stage_expires_at)
   values(e.id,uid,n+1,p,boundary,case when e.kind='meq' then least(boundary,now()+((p->0->>'minutes')::numeric*interval '1 minute')) else boundary end) returning * into t;
  return exam_delivery.run('paper',jsonb_build_object('attempt_id',t.id));
 end if;
 select * into t from exam_delivery.attempts where id=(payload->>'attempt_id')::uuid for update;
 if not found or t.user_id is distinct from uid then raise exception 'ไม่พบการสอบของคุณ'; end if;
 select * into e from exam_delivery.exams where id=t.exam_id;
 if t.status='in_progress' then
  if now()>=t.expires_at then perform exam_delivery.finish(t.id);
  elsif e.kind='meq' then
   while now()>=t.stage_expires_at loop
    if t.current_stage+1>=jsonb_array_length(t.paper) then perform exam_delivery.finish(t.id); exit; end if;
    t.current_stage:=t.current_stage+1;
    t.stage_expires_at:=least(t.expires_at,t.stage_expires_at+((t.paper->t.current_stage->>'minutes')::numeric*interval '1 minute'));
    update exam_delivery.attempts set current_stage=t.current_stage,stage_expires_at=t.stage_expires_at,revision=revision+1 where id=t.id;
   end loop;
  end if;
  select * into t from exam_delivery.attempts where id=t.id;
 end if;
 if action in ('save','advance','submit') and t.status='in_progress' then
  if (payload->>'revision')::int is distinct from t.revision then return jsonb_build_object('conflict',true,'revision',t.revision); end if;
  if e.kind='meq' and (payload->>'stage')::int is distinct from t.current_stage then return jsonb_build_object('conflict',true,'revision',t.revision); end if;
  if jsonb_typeof(coalesce(payload->'answers','{}'))<>'object' then raise exception 'รูปแบบคำตอบไม่ถูกต้อง'; end if;
  for kv in select * from jsonb_each_text(coalesce(payload->'answers','{}')) loop
   if length(kv.value)>30000 then raise exception 'คำตอบยาวเกินกำหนด'; end if;
   if e.kind='mcq' then
    select value,ordinality::int-1 into q,i from jsonb_array_elements(t.paper) with ordinality where value->>'id'=kv.key;
    if q is null or (not e.allow_back and i<>t.current_stage) then raise exception 'ข้อนี้ไม่สามารถแก้คำตอบได้'; end if;
    if coalesce(kv.value,'')<>'' and not exists(select 1 from jsonb_array_elements(q->'options') o where o->>'id'=kv.value) then raise exception 'ตัวเลือกไม่ถูกต้อง'; end if;
   else
    if not exists(select 1 from jsonb_array_elements(t.paper->t.current_stage->'questions') q where q->>'id'=kv.key) then raise exception 'ตอนนี้ถูกล็อกหรือยังไม่เปิด'; end if;
   end if;
   t.answers:=jsonb_set(t.answers,array[kv.key],to_jsonb(coalesce(kv.value,'')));
  end loop;
  if jsonb_typeof(coalesce(payload->'flags','{}'))<>'object' then raise exception 'รูปแบบปักหมุดไม่ถูกต้อง'; end if;
  update exam_delivery.attempts set answers=t.answers,flags=coalesce(payload->'flags',flags),revision=revision+1 where id=t.id returning * into t;
  if action='submit' then perform exam_delivery.finish(t.id);
  elsif action='advance' then
   if e.kind='mcq' and e.allow_back then raise exception 'ใช้การนำทางปกติ'; end if;
   if t.current_stage+1>=jsonb_array_length(t.paper) then perform exam_delivery.finish(t.id);
   else
    update exam_delivery.attempts set current_stage=current_stage+1,stage_expires_at=case when e.kind='meq' then least(expires_at,now()+((paper->(current_stage+1)->>'minutes')::numeric*interval '1 minute')) else expires_at end,revision=revision+1 where id=t.id;
   end if;
  end if;
  select * into t from exam_delivery.attempts where id=t.id;
 end if;
 if action not in ('paper','save','advance','submit','result') then raise exception 'คำสั่งไม่ถูกต้อง'; end if;
 safe:='[]';
 if t.status='in_progress' then
  if e.kind='mcq' then
   for q,i in select value,ordinality::int-1 from jsonb_array_elements(t.paper) with ordinality loop
    if e.allow_back or i=t.current_stage then
     select jsonb_agg(jsonb_build_object('id',o->>'id','body',o->>'body') order by ord) into opts from jsonb_array_elements(q->'options') with ordinality as x(o,ord);
     safe:=safe||jsonb_build_array(jsonb_build_object('id',q->>'id','stem',q->>'stem','options',opts,'position',i));
    end if;
   end loop;
  else
   s:=t.paper->t.current_stage;
   select jsonb_agg(jsonb_build_object('id',q->>'id','prompt',q->>'prompt','points',q->'points') order by ord) into opts from jsonb_array_elements(s->'questions') with ordinality as x(q,ord);
   safe:=jsonb_build_array(jsonb_build_object('title',s->>'title','scenario',s->>'scenario','questions',opts));
  end if;
 elsif e.show_answers and (e.kind='mcq' or t.status='graded') then safe:=t.paper;
 end if;
 -- Score and answer policies are enforced before data leaves the database.
 return jsonb_build_object('id',t.id,'exam_id',e.id,'title',e.title,'kind',e.kind,'status',t.status,'paper',safe,'answers',t.answers,'flags',t.flags,'stage',t.current_stage,'count',jsonb_array_length(t.paper),'allow_back',e.allow_back,'expires_at',t.expires_at,'stage_expires_at',t.stage_expires_at,'server_now',now(),'revision',t.revision,'submitted_at',t.submitted_at,'show_score',e.show_score,'show_answers',e.show_answers,'score',case when e.show_score and t.status<>'in_progress' then t.score else null end,'max_score',case when e.show_score and t.status<>'in_progress' then t.max_score else null end,'pass_mark',e.pass_mark,'grades',case when e.show_answers and t.status='graded' then t.grades else '{}'::jsonb end);
end $$;
revoke all on all functions in schema exam_delivery from public,anon,authenticated;
grant execute on function exam_delivery.manage(text,jsonb),exam_delivery.run(text,jsonb) to authenticated;
create function public.delivery_manage(action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select exam_delivery.manage(action,payload); $$;
create function public.delivery_run(action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select exam_delivery.run(action,payload); $$;
revoke all on function public.delivery_manage(text,jsonb),public.delivery_run(text,jsonb) from public,anon;
grant execute on function public.delivery_manage(text,jsonb),public.delivery_run(text,jsonb) to authenticated;
