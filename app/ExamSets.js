"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {BLOOM} from '../lib/constants';
import {newBlueprint,coverage} from '../lib/blueprint.mjs';
import {SPEC_VERSIONS,TOS,scaledTargets,ICD_SYSTEMS} from '../lib/tos.mjs';
import {proposeSet} from '../lib/sampler.mjs';
import Heat,{domainLabel} from './Heat';
import ItemPreview from './ItemPreview';
import ItemEditor from './ItemEditor';
const statuses={draft:'ร่าง',ready:'พร้อมใช้',archived:'เก็บ'};
const activeStates={active:'ใช้งาน',pending:'กำลังเตรียม',inactive:'ปิดใช้'};
const activeCls={active:'approved',pending:'draft',inactive:''};
const DETAIL_TASKS=[['dx','วินิจฉัย'],['labs','ตรวจ Lab'],['tx','รักษา'],['patho','พยาธิกำเนิด'],['prognosis','พยากรณ์']];
const TASK_SHORT=Object.fromEntries(DETAIL_TASKS);
const beYear=(iso)=>{if(!iso)return null;const y=new Date(iso).getFullYear();return isNaN(y)?null:y+543;};
const fields={specialty_id:'สาขาวิชา',nl_domain_code:'หมวด NL',physician_task:'ภารกิจแพทย์',bloom_level:'ระดับ Bloom'};
export default function ExamSets({sb,bp,me,notify}){
 const [kind,setKind]=useState('mcq'),[sets,setSets]=useState([]),[sel,setSel]=useState(null),[items,setItems]=useState([]),[pool,setPool]=useState([]);
 const [name,setName]=useState(''),[plan,setPlan]=useState(newBlueprint),[dirty,setDirty]=useState(false),[step,setStep]=useState('plan'),[search,setSearch]=useState(''),[filter,setFilter]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lock=useRef(false);
 const [creating,setCreating]=useState(false);
 const [renaming,setRenaming]=useState(false),[editName,setEditName]=useState(''),[editDesc,setEditDesc]=useState('');
 const [covScope,setCovScope]=useState('set');
 const [qmap,setQmap]=useState({});
 const [pickIcd,setPickIcd]=useState('');
 const [viewItem,setViewItem]=useState(null);
 const [editItem,setEditItem]=useState(null);
 const [magicPick,setMagicPick]=useState(null);
 const [magicOpen,setMagicOpen]=useState(null),[magicDetail,setMagicDetail]=useState({});
 const [autoPlan,setAutoPlan]=useState(null);
 const run=async(fn)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await fn();}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}};
 const query=async(p)=>{const r=await p;if(r.error)throw Error(r.error.message);return r.data||[];};
 const loadSets=useCallback(async()=>{const {data,error}=await sb.from('exam_sets').select('*').order('id',{ascending:true});if(error)throw Error(error.message);setSets(data||[]);},[sb]);
 useEffect(()=>{loadSets().catch(e=>setError(e.message));},[loadSets]);
 const restored=useRef(false);
 useEffect(()=>{if(restored.current||sel||!sets.length)return;let id=null;try{id=localStorage.getItem('cpird_sel_'+kind);}catch{}if(!id)return;const s=sets.find(x=>String(x.id)===id&&x.kind===kind);if(s){restored.current=true;run(()=>open(s));}},[sets,kind,sel]);
 useEffect(()=>{if(!dirty)return;const f=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',f);return()=>window.removeEventListener('beforeunload',f);},[dirty]);
 const load=async(s)=>{
  const table=s.kind==='meq'?'exam_set_cases':'exam_set_items';
  const chosen=await query(sb.from(table).select('*').eq('exam_set_id',s.id).order('position'));
  let available;
  if(s.kind==='meq')available=await query(sb.from('meq_cases').select('id,title,document,academic_year').order('updated_at',{ascending:false}));
  else {
   available=await query(sb.from('bank_items').select('id,current_version_id,status,specialty_id,nl_domain_code,physician_task,bloom_level,icd_system,nl_group,use_count,last_used_at,author_id,is_sample,created_at').eq('type','mcq').neq('status','personal').order('updated_at',{ascending:false}));
   const ids=available.map(x=>x.current_version_id).filter(Boolean);
   const versions=ids.length?await query(sb.from('bank_item_versions').select('id,stem').in('id',ids)):[];
   const stems=new Map(versions.map(v=>[v.id,v.stem]));available=available.map(x=>({...x,title:stems.get(x.current_version_id)||'ยังไม่มีโจทย์'}));
   const aids=available.map(x=>x.id);
   const st=aids.length?await query(sb.from('bank_item_stats').select('item_id,p_value,discrimination,point_biserial,n,distractors,computed_at').in('item_id',aids).order('computed_at',{ascending:false})):[];
   const qm={};st.forEach(s=>{if(!qm[s.item_id])qm[s.item_id]=s;});setQmap(qm);
  }
  setPool(available);setItems(chosen.map(x=>({...x,detail:available.find(p=>String(p.id)===String(x.item_id||x.case_id))||{title:'ไม่พบข้อสอบหรือไม่มีสิทธิ์อ่าน'}})));
 };
 const open=async(s)=>{if(dirty){setError('กรุณาบันทึก Table of Specifications ก่อนเปลี่ยนชุด');return;}await load(s);setSel(s);setPlan(s.blueprint||newBlueprint());setStep(s.kind==='mcq'?'plan':'select');setSearch('');setFilter(null);try{localStorage.setItem('cpird_sel_'+s.kind,String(s.id));}catch{}};
 const create=()=>run(async()=>{if(dirty)throw Error('บันทึกตารางของชุดปัจจุบันก่อน');if(!name.trim())throw Error('กรุณาตั้งชื่อชุดข้อสอบ');const r=await query(sb.from('exam_sets').insert({name:name.trim(),kind,blueprint:kind==='mcq'?newBlueprint():{},active_state:'pending',created_by:me}).select('*').single());await open(r);setName('');setCreating(false);await loadSets();});
 const save=async()=>{if(!stats.valid)throw Error('เพิ่มสัดส่วนอย่างน้อยหนึ่งช่อง เลือกหมวดให้ครบ จำนวนเป็นจำนวนเต็มมากกว่า 0 และไม่ซ้ำช่องเดิม');const result=await query(sb.from('exam_sets').update({blueprint:plan,status:'draft',updated_at:new Date().toISOString()}).eq('id',sel.id).select('*').single());setSel(result);setDirty(false);await loadSets();notify('บันทึกตารางแล้ว ข้อที่เลือกไว้ยังอยู่ครบ');};
 const changePlan=p=>{setPlan(p);setDirty(true);setFilter(null);};
 const mutate=fn=>run(async()=>{await fn();await load(sel);setSel(s=>({...s,status:'draft'}));await loadSets();});
 const add=p=>mutate(async()=>{if(items.some(x=>String(x.item_id||x.case_id)===String(p.id)))return;await query(sb.from(kind==='mcq'?'exam_set_items':'exam_set_cases').insert({exam_set_id:sel.id,[kind==='mcq'?'item_id':'case_id']:p.id,position:items.length?Math.max(...items.map(x=>x.position))+1:1,...(kind==='mcq'?{points:1}:{})}));});
 const remove=x=>mutate(()=>query(sb.from(kind==='mcq'?'exam_set_items':'exam_set_cases').delete().eq('id',x.id)));
 const move=(i,dir)=>mutate(async()=>{const order=items.map(x=>x.id);[order[i],order[i+dir]]=[order[i+dir],order[i]];await query(sb.rpc('reorder_exam_set',{set_id:sel.id,ordered_ids:order}));});
 const ready=()=>run(async()=>{if(dirty)throw Error('บันทึกตารางก่อนเปลี่ยนสถานะ');const updated=await query(sb.from('exam_sets').update({status:sel.status==='ready'?'draft':'ready',updated_at:new Date().toISOString()}).eq('id',sel.id).select('*').single());setSel(updated);await loadSets();});
 const rename=()=>run(async()=>{if(!editName.trim())throw Error('กรุณาตั้งชื่อชุด');const r=await query(sb.from('exam_sets').update({name:editName.trim(),description:editDesc.trim()||null,updated_at:new Date().toISOString()}).eq('id',sel.id).select('*').single());setSel(s=>({...s,name:r.name,description:r.description}));setRenaming(false);await loadSets();notify('บันทึกข้อมูลชุดแล้ว');});
 const duplicate=()=>run(async()=>{if(dirty)throw Error('บันทึกตารางก่อนทำซ้ำ');const r=await query(sb.from('exam_sets').insert({name:sel.name+' (สำเนา)',kind:sel.kind,blueprint:sel.blueprint||(sel.kind==='mcq'?newBlueprint():{}),active_state:'pending',description:sel.description||null,created_by:me}).select('*').single());const rows=items.map(x=>sel.kind==='mcq'?{exam_set_id:r.id,item_id:x.item_id,position:x.position,points:x.points}:{exam_set_id:r.id,case_id:x.case_id,position:x.position});if(rows.length)await query(sb.from(sel.kind==='mcq'?'exam_set_items':'exam_set_cases').insert(rows));await loadSets();await open(r);notify('ทำซ้ำเป็นชุดใหม่: '+r.name);});
 const archive=()=>run(async()=>{const to=sel.status==='archived'?'draft':'archived';const r=await query(sb.from('exam_sets').update({status:to,updated_at:new Date().toISOString()}).eq('id',sel.id).select('*').single());setSel(r);await loadSets();notify(to==='archived'?'เก็บชุดเข้าคลังแล้ว':'นำชุดกลับมาแก้ไขแล้ว');});
 const delSet=()=>run(async()=>{const used=await query(sb.from('exam_assignments').select('id').eq('exam_set_id',sel.id).limit(1));if(used.length)throw Error('ชุดนี้ถูกใช้ในรอบสอบแล้ว จึงลบไม่ได้ (การลบจะลบรอบสอบและผลสอบด้วย) — ใช้ปุ่ม “เก็บเข้าคลัง” แทน');if(!confirm('ลบชุด “'+sel.name+'” ถาวร?\nข้อที่เลือกไว้จะถูกนำออกจากชุด (ตัวข้อสอบในคลังยังอยู่)'))return;await query(sb.from('exam_sets').delete().eq('id',sel.id));try{localStorage.removeItem('cpird_sel_'+kind);}catch{}setSel(null);setItems([]);setRenaming(false);await loadSets();notify('ลบชุดแล้ว');});
 const setSpec=(v)=>run(async()=>{const r=await query(sb.from('exam_sets').update({spec_version:v||null,updated_at:new Date().toISOString()}).eq('id',sel.id).select('*').single());setSel(r);await loadSets();});
 const setTargetCount=(n)=>run(async()=>{const val=Number(n)>0?Math.round(Number(n)):null;const r=await query(sb.from('exam_sets').update({target_count:val,updated_at:new Date().toISOString()}).eq('id',sel.id).select('*').single());setSel(r);await loadSets();});
 const setActive=(v)=>run(async()=>{const r=await query(sb.from('exam_sets').update({active_state:v,updated_at:new Date().toISOString()}).eq('id',sel.id).select('*').single());setSel(s=>({...s,active_state:r.active_state}));await loadSets();notify('เปลี่ยนสถานะเป็น '+activeStates[v]);});
 const setDetailCell=(rowKey,task,val)=>{const tm={...(plan.taskMatrix||{})};const row={...(tm[rowKey]||{})};if(val==='')delete row[task];else row[task]=Math.max(0,Math.round(Number(val)||0));tm[rowKey]=row;changePlan({...plan,taskMatrix:tm});};
 const saveDetail=()=>run(async()=>{const r=await query(sb.from('exam_sets').update({blueprint:plan,updated_at:new Date().toISOString()}).eq('id',sel.id).select('*').single());setSel(r);setDirty(false);await loadSets();notify('บันทึกตารางสเปกละเอียดแล้ว');});
 const stats=coverage(plan,items.map(x=>x.detail));
 const spec=sel&&sel.spec_version?scaledTargets(sel.spec_version,sel.target_count):null;
 const setIcd={};
 const setIcdG={};
 if(spec)items.forEach(x=>{const d=x.detail;if(d&&d.icd_system){const c=d.icd_system;setIcd[c]=(setIcd[c]||0)+1;const g=setIcdG[c]||(setIcdG[c]={2:0,3:0,o:0});if(d.nl_group===2)g[2]++;else if(d.nl_group===3)g[3]++;else g.o++;}});
 // magic selection quality signals
 const usedBefore=(p)=>!!qmap[p.id]||p.use_count>0;
 const usedNote=(p)=>{const n=(qmap[p.id]?.n)||0;return usedBefore(p)?('เคยใช้สอบแล้ว'+(n?(' · ผู้ตอบ '+n+' คน'):'')+' → ควรออกคู่ขนาน'):'ยังไม่เคยใช้สอบ';};
 const MIN_N=10;
 // quality from real item statistics (p-value = ความยาก, discrimination = อำนาจจำแนก, n = จำนวนผู้ตอบ)
 const quality=(p)=>{const s=qmap[p.id];
  if(!s||s.n==null||s.n<MIN_N)return{label:'ยังไม่มีสถิติ',cls:'muted',detail:s&&s.n?('ผู้ตอบ '+s.n+' คน (ยังน้อย)'):'ยังไม่เคยใช้สอบจริง',hasStats:false};
  const pv=s.p_value,d=s.discrimination;
  const detail=`ยาก(p) ${pv!=null?pv.toFixed(2):'–'} · จำแนก(r) ${d!=null?d.toFixed(2):'–'} · n=${s.n}`;
  let label,cls;
  if(d==null){label='—';cls='muted';}
  else if(d>=0.30&&pv!=null&&pv>=0.30&&pv<=0.85){label='ดี';cls='gap-ok';}
  else if(d>=0.20){label='พอใช้';cls='gap-over';}
  else{label='ควรปรับปรุง';cls='gap-short';}
  if(pv!=null){if(pv>0.85)label+=' · ง่ายไป';else if(pv<0.30)label+=' · ยากไป';}
  return{label,cls,detail,hasStats:true};
 };
 const isGood=(p)=>{const s=qmap[p.id];if(!s)return true;if(s.discrimination!=null&&s.discrimination<0.15)return false;if(s.p_value!=null&&(s.p_value<0.2||s.p_value>0.9))return false;return true;};
 // rank for auto-fill: prefer good stats, then unused-but-untested, then poor
 const qscore=(p)=>{const q=quality(p);if(q.hasStats)return q.cls==='gap-ok'?4:q.cls==='gap-over'?3:1;return usedBefore(p)?2:3;};
 const magicFill=(icdCode,group,need)=>mutate(async()=>{
  const have=new Set(items.map(x=>String(x.item_id)));
  const cands=pool.filter(p=>p.status==='approved'&&p.icd_system===icdCode&&(group?p.nl_group===group:true)&&!have.has(String(p.id)));
  if(!cands.length)throw Error('ไม่มีข้อในคลัง (ระบบ/กลุ่มนี้) — แนะนำให้ออกข้อใหม่');
  const ranked=[...cands].sort((a,b)=>qscore(b)-qscore(a)).slice(0,need);
  const base=items.length?Math.max(...items.map(x=>x.position)):0;
  await query(sb.from('exam_set_items').insert(ranked.map((p,i)=>({exam_set_id:sel.id,item_id:p.id,position:base+i+1,points:1}))));
  notify('เติม '+ranked.length+' ข้ออัตโนมัติ'+(ranked.length<need?(' — ยังขาดอีก '+(need-ranked.length)+' ข้อ ควรออกใหม่'):''));
 });
 const setG1=spec?items.filter(x=>x.detail&&x.detail.nl_group===1).length:0;
 const setCat1=spec?items.filter(x=>x.detail&&!x.detail.icd_system&&x.detail.nl_domain_code!=='X').length:0;
 const magicFillG1=(need)=>mutate(async()=>{const have=new Set(items.map(x=>String(x.item_id)));const cands=pool.filter(p=>p.status==='approved'&&p.nl_group===1&&!have.has(String(p.id)));if(!cands.length)throw Error('ไม่มีข้อฉุกเฉินในคลัง — แนะนำให้ออกข้อใหม่');const ranked=[...cands].sort((a,b)=>qscore(b)-qscore(a)).slice(0,need);const base=items.length?Math.max(...items.map(x=>x.position)):0;await query(sb.from('exam_set_items').insert(ranked.map((p,i)=>({exam_set_id:sel.id,item_id:p.id,position:base+i+1,points:1}))));notify('เติมข้อฉุกเฉิน '+ranked.length+' ข้ออัตโนมัติ');});
 const fullItem=(id)=>query(sb.from('bank_items').select('*').eq('id',id).single());
 const openView=(id)=>run(async()=>setViewItem(await fullItem(id)));
 const openEdit=(id)=>run(async()=>setEditItem(await fullItem(id)));
 const parallel=(id)=>run(async()=>{
  const nid=await query(sb.rpc('bank_duplicate_item',{_id:id}));
  if(confirm('สร้างข้อคู่ขนาน #'+nid+' (ร่าง) เข้าคลังแล้ว\nเพิ่มเข้าชุดนี้ด้วยหรือไม่? (กด OK = เพิ่ม)')){const base=items.length?Math.max(...items.map(x=>x.position)):0;await query(sb.from('exam_set_items').insert({exam_set_id:sel.id,item_id:nid,position:base+1,points:1}));}
  await load(sel);await loadSets();
  setEditItem(await fullItem(nid));
  notify('สร้างข้อคู่ขนาน #'+nid+' — แก้ไขให้ต่างจากต้นฉบับแล้วบันทึก');
 });
 const openMagic=(pred,need,label)=>{const have=new Set(items.map(x=>String(x.item_id)));const cands=pool.filter(p=>p.status==='approved'&&pred(p)&&!have.has(String(p.id))).sort((a,b)=>qscore(b)-qscore(a));setMagicOpen(null);setMagicPick({label,need,cands,sel:new Set(cands.slice(0,need).map(p=>p.id))});};
 const toggleMagicView=(id)=>run(async()=>{if(magicOpen===id){setMagicOpen(null);return;}setMagicOpen(id);if(!magicDetail[id]){const it=await fullItem(id);let ver=null,opts=[];if(it.current_version_id){const vr=await query(sb.from('bank_item_versions').select('*').eq('id',it.current_version_id).limit(1));ver=vr[0]||null;opts=await query(sb.from('bank_item_options').select('*').eq('version_id',it.current_version_id).order('order_index'));}setMagicDetail(m=>({...m,[id]:{ver,options:opts}}));}});
 const toggleMagic=(id)=>setMagicPick(m=>{const s=new Set(m.sel);s.has(id)?s.delete(id):s.add(id);return{...m,sel:s};});
 const confirmMagic=()=>mutate(async()=>{const chosen=magicPick.cands.filter(p=>magicPick.sel.has(p.id));setMagicPick(null);if(!chosen.length)return;const base=items.length?Math.max(...items.map(x=>x.position)):0;await query(sb.from('exam_set_items').insert(chosen.map((p,i)=>({exam_set_id:sel.id,item_id:p.id,position:base+i+1,points:1}))));notify('เพิ่ม '+chosen.length+' ข้อเข้าชุดแล้ว');});

 // ── จัดชุดทั้งชุดตามเกณฑ์ ศรว. ในครั้งเดียว ───────────────────────────────
 // ต่างจาก magic เดิมที่เติมทีละช่อง ตรงที่มองทุกช่องพร้อมกัน จึงไม่ให้ช่องง่ายแย่งข้อของช่องหายากไป
 // ช่องที่ยังขาดหลังเสนอแล้ว แปลว่าคลังไม่มีข้อที่ตรงเงื่อนไขจริง ต้องออกข้อใหม่
 const autoTargets=()=>{
  if(!spec)return[];
  const inSet=(pred)=>items.filter(x=>x.detail&&pred(x.detail)).length;
  const cells=[
   {key:'cat1',label:'หมวด1 ทั่วไป',pred:i=>!i.icd_system&&i.nl_domain_code!=='X',target:spec.category1.target},
   {key:'group1',label:'กลุ่มฉุกเฉิน (group 1)',pred:i=>i.nl_group===1,target:spec.group1.target},
   ...spec.systems.filter(s=>s.g2>0).map(s=>({key:s.code+'-g2',label:'กลุ่ม 2 · '+s.roman+' '+s.th,pred:i=>i.icd_system===s.code&&i.nl_group===2,target:s.g2})),
   ...spec.systems.filter(s=>s.g3>0).map(s=>({key:s.code+'-g3',label:'กลุ่ม 3 · '+s.roman+' '+s.th,pred:i=>i.icd_system===s.code&&i.nl_group===3,target:s.g3})),
  ];
  return cells.map(c=>({...c,need:Math.max(0,c.target-inSet(c.pred))})).filter(c=>c.need>0);
 };
 const buildAuto=(seed)=>{
  const targets=autoTargets();
  if(!targets.length){notify('ชุดนี้ครบตามเกณฑ์แล้ว ไม่มีช่องที่ต้องเติม');return;}
  const plan=proposeSet({pool,stats:qmap,targets,chosen:items.map(x=>x.item_id),seed,now:Date.now()});
  setAutoPlan({...plan,seed,sel:new Set(plan.picks.map(p=>p.id))});
 };
 const toggleAuto=(id)=>setAutoPlan(a=>{const s=new Set(a.sel);s.has(id)?s.delete(id):s.add(id);return{...a,sel:s};});
 const confirmAuto=()=>mutate(async()=>{
  const chosen=autoPlan.picks.filter(p=>autoPlan.sel.has(p.id));setAutoPlan(null);
  if(!chosen.length)return;
  const base=items.length?Math.max(...items.map(x=>x.position)):0;
  await query(sb.from('exam_set_items').insert(chosen.map((p,i)=>({exam_set_id:sel.id,item_id:p.id,position:base+i+1,points:1}))));
  notify('จัดชุดอัตโนมัติ เพิ่ม '+chosen.length+' ข้อเข้าชุดแล้ว');
 });
 const poolTitle=(id)=>{const p=pool.find(x=>String(x.id)===String(id));return p?(p.title||'').slice(0,120):'#'+id;};
 const props2569=spec&&sel.spec_version==='2569'?TOS['2569'].taskProps:null;
 const taskGap=props2569?[['dx','วินิจฉัย'],['labs','ตรวจทางห้องปฏิบัติการ'],['tx','รักษา'],['patho','พยาธิกำเนิด'],['prognosis','พยากรณ์โรค']].map(([code,label])=>{
  const target=Math.round(spec.group1.target*props2569.group1[code]+spec.diseaseTotal*props2569.group23[code]);
  const actual=items.filter(x=>x.detail&&x.detail.physician_task===code).length;
  return{code,label,target,actual,diff:actual-target};
 }):null;
 const covSource=covScope==='set'?items.map(x=>x.detail):pool;
 const cby=(pred)=>covSource.filter(pred).length;
 const covTask=bp.domains.map(d=>bp.tasks.map(t=>cby(i=>i.nl_domain_code===d.code&&i.physician_task===t.code)));
 const covSpecs=bp.specs.filter(s=>covSource.some(i=>i.specialty_id===s.id));
 const covSpec=bp.domains.map(d=>covSpecs.map(s=>cby(i=>i.nl_domain_code===d.code&&i.specialty_id===s.id)));
 const options=field=>field==='specialty_id'?(bp.specs||[]).map(x=>[String(x.id),x.name_th]):field==='nl_domain_code'?(bp.domains||[]).map(x=>[x.code,x.code+' '+(x.name||'')]):field==='physician_task'?(bp.tasks||[]).map(x=>[x.code,x.name]):BLOOM.map(x=>[x,x]);
 const label=(field,value)=>options(field).find(x=>x[0]===value)?.[1]||value;
 const totals=items.reduce((a,x)=>{for(const s of x.detail.document?.stages||[]){a.minutes+=Number(s.minutes)||0;a.stages++;for(const q of s.questions||[])a.points+=Number(q.points)||0;}return a;},{minutes:0,stages:0,points:0});
 const available=pool.filter(p=>(kind==='meq'||p.status==='approved')&&p.title.toLowerCase().includes(search.toLowerCase())&&(!filter||(String(p[plan.rowField])===filter.row&&String(p[plan.columnField])===filter.column))&&(!pickIcd||String(p.icd_system)===pickIcd));
 return <div><header className="set-heading"><div><h1>สร้างชุดข้อสอบ</h1><p className="set-note">{kind==='mcq'?'กำหนดสัดส่วน → เลือกข้อสอบ → ตรวจความครบถ้วน':'เลือกเคส MEQ และเรียงลำดับการสอบ'}</p></div><div className="row" aria-label="ประเภทชุดข้อสอบ">{['mcq','meq'].map(k=><button key={k} className={'btn '+(kind===k?'':'ghost')} aria-pressed={kind===k} disabled={busy} onClick={()=>{if(dirty){setError('บันทึกตารางก่อนเปลี่ยนประเภท');return;}setKind(k);setSel(null);setItems([]);setError('');}}>{k.toUpperCase()}</button>)}</div></header>
 {error&&<p className="delivery-alert" role="alert">{error}</p>}
 <div className="set-workspace"><aside className="set-library" aria-label="เลือกหรือสร้างชุดข้อสอบ">
 <div className="set-cards">{sets.filter(s=>s.kind===kind).map(s=>{const active=sel&&sel.id===s.id;return <button key={s.id} type="button" className={'set-card'+(active?' active':'')+(s.active_state==='inactive'?' set-card-dim':'')} disabled={busy} aria-pressed={active} onClick={()=>{if(!active)run(()=>open(s));}}><div className="set-card-title">{s.name}</div><div className="set-card-meta"><span className={'pill '+activeCls[s.active_state||'active']}>{activeStates[s.active_state||'active']}</span>{s.spec_version?<span className="muted">เกณฑ์ {s.spec_version}</span>:null}{s.target_count?<span className="muted">{s.target_count} ข้อ</span>:null}</div></button>;})}<button type="button" className="set-card set-card-add" disabled={busy} aria-controls="set-create-form" onClick={()=>setCreating(true)}><span style={{fontSize:22,lineHeight:1}}>＋</span><span>สร้างชุด {kind.toUpperCase()} ใหม่</span></button></div>
 {(creating||!sets.some(s=>s.kind===kind))&&<form id="set-create-form" className="set-create-form" onSubmit={e=>{e.preventDefault();create();}}><label>ชื่อชุด {kind.toUpperCase()} ใหม่<input value={name} onChange={e=>setName(e.target.value)} required maxLength={300}/></label><button className="btn" disabled={busy}>สร้างชุด {kind.toUpperCase()}</button>{sets.some(s=>s.kind===kind)&&<button type="button" className="btn ghost" disabled={busy} onClick={()=>setCreating(false)}>ยกเลิก</button>}</form>}
 </aside>
 <section className="card set-panel">{!sel?<div className="empty"><h2>{kind==='mcq'?'เริ่มจาก Table of Specifications':'จัดชุดข้อสอบ MEQ'}</h2><p>{kind==='mcq'?'ตั้งชื่อชุด แล้วกำหนดจำนวนข้อในแต่ละหมวดก่อนเลือกข้อจากคลัง':'ตั้งชื่อชุด แล้วเลือกเคสจากคลัง MEQ แต่ละเคสคงลำดับตอนและเกณฑ์คะแนนของตนเอง'}</p></div>:<><div className="set-heading"><h2>{sel.name}</h2><span className={'pill '+activeCls[sel.active_state||'active']}>{activeStates[sel.active_state||'active']}</span><div className="row" style={{gap:6,marginLeft:'auto',flexWrap:'wrap'}}><label className="mk" style={{margin:0,display:'flex',alignItems:'center',gap:4}}>สถานะ<select value={sel.active_state||'active'} disabled={busy} onChange={e=>setActive(e.target.value)}>{Object.entries(activeStates).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><button className="btn ghost sm" disabled={busy} onClick={()=>{setEditName(sel.name);setEditDesc(sel.description||'');setRenaming(!renaming);}}>✎ เปลี่ยนชื่อ/รายละเอียด</button><button className="btn ghost sm" disabled={busy} onClick={duplicate}>⧉ ทำซ้ำ</button><button className="btn ghost sm" disabled={busy} onClick={archive}>{sel.status==='archived'?'↩ นำกลับมาแก้':'📦 เก็บเข้าคลัง'}</button><button className="btn ghost sm" style={{color:'var(--stop)'}} disabled={busy} onClick={delSet}>🗑 ลบชุด</button></div></div>{sel.description&&!renaming&&<p className="set-note">{sel.description}</p>}{renaming&&<form className="set-create-form" onSubmit={e=>{e.preventDefault();rename();}}><label>ชื่อชุด<input value={editName} onChange={e=>setEditName(e.target.value)} required maxLength={300}/></label><label>คำอธิบาย (ไม่บังคับ)<input value={editDesc} onChange={e=>setEditDesc(e.target.value)} maxLength={1000}/></label><button className="btn" disabled={busy}>บันทึก</button><button type="button" className="btn ghost" disabled={busy} onClick={()=>setRenaming(false)}>ยกเลิก</button></form>}
 <div className="set-steps">{(kind==='mcq'?[['plan','1. Table of Specifications'],['select','2. เลือกข้อสอบ'],['review','3. ตรวจชุดข้อสอบ']]:[['select','1. เลือกเคส MEQ'],['review','2. ตรวจชุดข้อสอบ']]).map(([key,title])=><button key={key} className="btn ghost" aria-pressed={step===key} disabled={busy||(kind==='mcq'&&key!=='plan'&&!sel.blueprint?.cells?.length&&!items.length)} onClick={()=>setStep(key)}>{title}</button>)}</div>
 <div className="set-progress"><div><strong>{items.length}</strong>{kind==='mcq'?'ข้อที่เลือก':'เคสที่เลือก'}</div>{kind==='mcq'?<><div><strong>{stats.target}</strong>เป้าหมายตามตาราง</div><div><strong>{items.reduce((n,x)=>n+Number(x.points||0),0)}</strong>คะแนนรวม</div></>:<><div><strong>{totals.stages}</strong>ตอน</div><div><strong>{totals.minutes}</strong>นาที</div><div><strong>{totals.points}</strong>คะแนน</div></>}</div>
 {kind==='mcq'&&(step==='plan'||step==='review')&&<section className="set-spec">
 <h3>เทียบเกณฑ์ ศรว. (Table of Specifications)</h3>
 <div className="grid2">
 <label>เกณฑ์มาตรฐาน<select value={sel.spec_version||''} disabled={busy} onChange={e=>setSpec(e.target.value)}><option value="">— ไม่อิงเกณฑ์ —</option>{SPEC_VERSIONS.map(v=><option key={v} value={v}>{TOS[v].label}</option>)}</select></label>
 <label>จำนวนข้อที่จะออก<input type="number" min="1" step="1" key={'tc-'+sel.id+'-'+(sel.target_count||'')} defaultValue={sel.target_count||''} disabled={busy||!sel.spec_version} placeholder={sel.spec_version?('เต็ม '+TOS[sel.spec_version].total+' ข้อ'):'เลือกเกณฑ์ก่อน'} onBlur={e=>{if(String(sel.target_count||'')!==String(e.target.value))setTargetCount(e.target.value);}}/></label>
 </div>
 {spec&&<>
 <p className="set-note">{spec.note} · ฐาน {spec.total} ข้อ → ปรับเป็น {spec.N} ข้อ (หมวด1 ทั่วไป {spec.category1.target} · ฉุกเฉิน {spec.group1.target} · โรคตามระบบ {spec.diseaseTotal})</p>
 <div className="mk" style={{margin:'6px 0 6px'}}>① กำหนดตาราง (Table of Specifications) — จำนวนข้อรายภารกิจแพทย์ (ใส่ในช่องว่าง)</div>
 <p className="set-note">ช่องบน = จำนวนที่กำหนดเอง (แก้ได้) · ตัวเลขล่างเล็ก = มีในชุดแล้ว · ผลรวมแต่ละแถวควรเท่ากับเป้าหมายของแถวนั้น</p>
 <div className="tablewrap"><table className="set-detail"><thead><tr><th>หมวด / ระบบโรค</th>{DETAIL_TASKS.map(([c,l])=><th key={c}>{l}</th>)}<th>รวม / เป้า</th></tr></thead><tbody>
 {(()=>{const rows=[{key:'cat1',label:'หมวด1 ทั่วไป',target:spec.category1.target,pred:i=>!i.icd_system&&i.nl_domain_code!=='X'},{key:'group1',label:'กลุ่มฉุกเฉิน (group1)',target:spec.group1.target,pred:i=>i.nl_group===1},...spec.systems.filter(s=>s.target>0).map(s=>({key:String(s.code),label:s.roman+'. '+s.th,target:s.target,pred:i=>i.icd_system===s.code}))];
 return rows.map(r=>{const tm=(plan.taskMatrix||{})[r.key]||{};const sum=DETAIL_TASKS.reduce((n,[c])=>n+(Number(tm[c])||0),0);return <tr key={r.key}><td title={r.label}>{r.label}</td>{DETAIL_TASKS.map(([c])=>{const act=items.filter(x=>x.detail&&r.pred(x.detail)&&x.detail.physician_task===c).length;return <td key={c}><input aria-label={r.label+' '+c} type="number" min="0" step="1" style={{width:52}} value={tm[c]??''} disabled={busy} onChange={e=>setDetailCell(r.key,c,e.target.value)}/><div className="muted" style={{fontSize:11}}>มี {act}</div></td>;})}<td className={sum===r.target?'gap-ok':sum<r.target?'gap-short':'gap-over'}>{sum}/{r.target}</td></tr>;});})()}
 </tbody></table></div>
 <div className="set-actions"><button className="btn" disabled={busy} onClick={saveDetail}>บันทึกตาราง{dirty?' *':''}</button></div>
 <p className="set-note">* การจัด ICD/กลุ่ม 1-2-3 ของข้อเดิมเป็นแบบอัตโนมัติ ควรให้กรรมการรีวิว · การแยกกลุ่มควรอิงรายชื่อโรคทางการของ ศรว.</p>
 <div className="row" style={{margin:'18px 0 6px',alignItems:'center',gap:10,flexWrap:'wrap'}}>
  <div className="mk" style={{margin:0}}>② สรุปความครบถ้วนเทียบเกณฑ์ (ขาด / เกิน)</div>
  <button className="btn" style={{marginLeft:'auto'}} disabled={busy} onClick={()=>buildAuto(String(Date.now()))}>✨ จัดชุดทั้งชุดตามเกณฑ์</button>
 </div>
 <p className="set-note">การจัดทั้งชุดจะมองทุกช่องพร้อมกัน ช่องที่มีข้อให้เลือกน้อยจะได้สิทธิ์เลือกก่อน เลี่ยงข้อที่เพิ่งใช้สอบหรือใช้ซ้ำบ่อย และไม่ให้ผู้แต่งคนเดียวครองชุด</p>
 <div className="tablewrap"><table><thead><tr><th>ภาพรวม</th><th>เป้าหมาย</th><th>มีในชุด</th><th>ขาด / เกิน</th><th>เติมอัตโนมัติ (magic)</th></tr></thead><tbody>
 {(()=>{const d=setCat1-spec.category1.target;const avail=pool.filter(p=>p.status==='approved'&&!p.icd_system&&p.nl_domain_code!=='X'&&!items.some(x=>String(x.item_id)===String(p.id))).length;return <tr><td>หมวด1 ทั่วไป (ส่งเสริม/จริยธรรม/นิติเวช)</td><td>{spec.category1.target}</td><td>{setCat1}</td><td className={d<0?'gap-short':d>0?'gap-over':'gap-ok'}>{d===0?'ครบ':d<0?('ขาด '+(-d)):('เกิน '+d)}</td><td>{d<0?(avail>0?<button className="btn ghost sm" disabled={busy} onClick={()=>openMagic(p=>!p.icd_system&&p.nl_domain_code!=='X',-d,'หมวด1 ทั่วไป')}>✨ เลือกเติม {Math.min(-d,avail)} ข้อ</button>:<span className="gap-short">ไม่มีในคลัง — ออกใหม่</span>):null}</td></tr>;})()}
 {(()=>{const d=setG1-spec.group1.target;const avail=pool.filter(p=>p.status==='approved'&&p.nl_group===1&&!items.some(x=>String(x.item_id)===String(p.id))).length;return <tr><td>กลุ่มฉุกเฉิน (group 1)</td><td>{spec.group1.target}</td><td>{setG1}</td><td className={d<0?'gap-short':d>0?'gap-over':'gap-ok'}>{d===0?'ครบ':d<0?('ขาด '+(-d)):('เกิน '+d)}</td><td>{d<0?(avail>0?<button className="btn ghost sm" disabled={busy} onClick={()=>openMagic(p=>p.nl_group===1,-d,'กลุ่มฉุกเฉิน (group 1)')}>✨ เลือกเติม {Math.min(-d,avail)} ข้อ</button>:<span className="gap-short">ไม่มีในคลัง — ออกใหม่</span>):null}</td></tr>;})()}
 </tbody></table></div>
 <div className="mk" style={{margin:'12px 0 6px'}}>โรคตามระบบ (แยกกลุ่ม 2 / 3) — แสดง มี/เป้า</div>
 <div className="tablewrap"><table><thead><tr><th>ระบบโรค (ICD)</th><th>กลุ่ม 2 (มี/เป้า)</th><th>กลุ่ม 3 (มี/เป้า)</th><th>เติมอัตโนมัติ (magic)</th></tr></thead><tbody>
 {spec.systems.filter(s=>s.target>0||setIcdG[s.code]).map(s=>{const g=setIcdG[s.code]||{2:0,3:0,o:0};const d2=g[2]-s.g2,d3=g[3]-s.g3;const av2=pool.filter(p=>p.status==='approved'&&p.icd_system===s.code&&p.nl_group===2&&!items.some(x=>String(x.item_id)===String(p.id))).length;const av3=pool.filter(p=>p.status==='approved'&&p.icd_system===s.code&&p.nl_group===3&&!items.some(x=>String(x.item_id)===String(p.id))).length;return <tr key={s.code}><td title={s.th}>{s.roman}. {s.th}{g.o>0?<span className="muted"> · ยังไม่ระบุกลุ่ม {g.o}</span>:''}</td><td className={d2<0?'gap-short':d2>0?'gap-over':'gap-ok'}>{g[2]}/{s.g2}</td><td className={d3<0?'gap-short':d3>0?'gap-over':'gap-ok'}>{g[3]}/{s.g3}</td><td><div className="row" style={{gap:4}}>{d2<0&&(av2>0?<button className="btn ghost sm" disabled={busy} onClick={()=>openMagic(p=>p.icd_system===s.code&&p.nl_group===2,-d2,'กลุ่ม 2 · '+s.roman+' '+s.th)}>✨ก2 {Math.min(-d2,av2)}</button>:<span className="gap-short">ก2 ออกใหม่</span>)}{d3<0&&(av3>0?<button className="btn ghost sm" disabled={busy} onClick={()=>openMagic(p=>p.icd_system===s.code&&p.nl_group===3,-d3,'กลุ่ม 3 · '+s.roman+' '+s.th)}>✨ก3 {Math.min(-d3,av3)}</button>:<span className="gap-short">ก3 ออกใหม่</span>)}</div></td></tr>;})}
 </tbody></table></div>
 {taskGap&&<><div className="mk" style={{margin:'12px 0 6px'}}>สัดส่วนตามภารกิจแพทย์ (เกณฑ์ 2569)</div>
 <div className="tablewrap"><table><thead><tr><th>ภารกิจ</th><th>เป้าหมาย</th><th>มีในชุด</th><th>ขาด / เกิน</th></tr></thead><tbody>
 {taskGap.map(t=><tr key={t.code}><td>{t.label}</td><td>{t.target}</td><td>{t.actual}</td><td className={t.diff<0?'gap-short':t.diff>0?'gap-over':'gap-ok'}>{t.diff===0?'ครบ':t.diff<0?('ขาด '+(-t.diff)):('เกิน '+t.diff)}</td></tr>)}
 </tbody></table></div></>}
 </>}
 </section>}
 {step==='plan'&&kind==='mcq'&&<><p className="set-note">หนึ่งแถวคือหนึ่งช่องของตาราง แก้สัดส่วนและกลับมาเพิ่มข้อได้ตลอด ข้อที่เลือกไว้จะไม่ถูกลบ การแก้ตารางจะยกเลิกสถานะพร้อมใช้ (delivery)</p><fieldset disabled={busy}><div className="grid2">{[['rowField','แกนเนื้อหา'],['columnField','แกนสมรรถนะ']].map(([key,title])=><label key={key}>{title}<select value={plan[key]} onChange={e=>changePlan({...plan,[key]:e.target.value,cells:plan.cells.map(c=>({...c,[key==='rowField'?'row':'column']:''}))})}>{Object.entries(fields).filter(([f])=>f!==plan[key==='rowField'?'columnField':'rowField']).map(([f,l])=><option key={f} value={f}>{l}</option>)}</select></label>)}</div><div className="tablewrap set-tos"><table><thead><tr><th>{fields[plan.rowField]}</th><th>{fields[plan.columnField]}</th><th>เป้าหมาย</th><th>เลือกแล้ว</th><th>ขาด / เกิน</th><th/></tr></thead><tbody>{stats.cells.map((c,i)=><tr key={i}>{['row','column'].map((axis)=><td key={axis}><select aria-label={`${axis==='row'?'เนื้อหา':'สมรรถนะ'} แถว ${i+1}`} value={c[axis]} onChange={e=>changePlan({...plan,cells:plan.cells.map((x,j)=>j===i?{...x,[axis]:e.target.value}:x)})}><option value="">เลือก</option>{options(plan[axis==='row'?'rowField':'columnField']).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></td>)}<td><input aria-label={`จำนวนเป้าหมาย แถว ${i+1}`} type="number" min="1" step="1" value={c.target} onChange={e=>changePlan({...plan,cells:plan.cells.map((x,j)=>j===i?{...x,target:Number(e.target.value)}:x)})}/></td><td>{c.actual}</td><td>{c.actual===c.target?'ครบ':c.actual<c.target?`ขาด ${c.target-c.actual}`:`เกิน ${c.actual-c.target}`}</td><td><button className="btn ghost sm" aria-label={`ลบสัดส่วนแถว ${i+1}`} onClick={()=>changePlan({...plan,cells:plan.cells.filter((_,j)=>j!==i)})}>ลบ</button></td></tr>)}</tbody></table></div><div className="set-actions"><button className="btn ghost" onClick={()=>changePlan({...plan,cells:[...plan.cells,{row:'',column:'',target:1}]})}>เพิ่มสัดส่วน</button><button className="btn" onClick={()=>run(save)}>บันทึกตาราง{dirty?' *':''}</button><button className="btn ghost" disabled={!sel.blueprint?.cells?.length||dirty} onClick={()=>setStep('select')}>ไปเลือกข้อสอบ →</button></div></fieldset></>}
 {step!=='plan'&&<><h3>{step==='review'?'ข้อสอบในชุด':'เลือกไว้แล้ว'}</h3>{!items.length?<p className="empty">ยังไม่ได้เลือก{kind==='mcq'?'ข้อสอบ':'เคส'}</p>:<div className="tablewrap"><table><thead><tr><th>ลำดับ</th><th>{kind==='mcq'?'โจทย์':'เคส MEQ'}</th><th>คะแนน</th><th>จัดลำดับ</th><th/></tr></thead><tbody>{items.map((x,i)=><tr key={x.id}><td>{i+1}</td><td>{x.detail.is_sample&&<span className="pill draft" style={{marginRight:6}}>🧪 ตัวอย่าง</span>}{x.detail.title.slice(0,160)}</td><td>{kind==='mcq'?<input aria-label={`คะแนนข้อ ${i+1}`} style={{width:75}} type="number" min="0.5" step="0.5" defaultValue={x.points} key={`${x.id}-${x.points}`} disabled={busy} onBlur={e=>{const p=Number(e.target.value);if(p!==Number(x.points))mutate(async()=>{if(!Number.isFinite(p)||p<=0)throw Error('คะแนนต้องมากกว่า 0');await query(sb.from('exam_set_items').update({points:p}).eq('id',x.id));});}}/>:(x.detail.document?.stages||[]).reduce((n,s)=>n+(s.questions||[]).reduce((v,q)=>v+Number(q.points||0),0),0)}</td><td><div className="row"><button className="btn ghost sm" aria-label={`เลื่อนข้อ ${i+1} ขึ้น`} disabled={busy||i===0} onClick={()=>move(i,-1)}>↑</button><button className="btn ghost sm" aria-label={`เลื่อนข้อ ${i+1} ลง`} disabled={busy||i===items.length-1} onClick={()=>move(i,1)}>↓</button></div></td><td><div className="row" style={{gap:4,flexWrap:'wrap'}}>{kind==='mcq'&&<><button className="btn ghost sm" disabled={busy} onClick={()=>openView(x.item_id)}>ดู</button><button className="btn ghost sm" disabled={busy} title="สร้างข้อคู่ขนาน (ห้ามแก้ไขข้อเดิม)" onClick={()=>parallel(x.item_id)}>ออกคู่ขนาน</button></>}<button className="btn ghost sm" style={{color:'var(--stop)'}} disabled={busy} onClick={()=>remove(x)}>นำออก</button></div></td></tr>)}</tbody></table></div>}
 {kind==='mcq'&&<><h3>ความครบถ้วนตามตาราง{dirty?' (ยังไม่บันทึก)':''}</h3>{stats.cells.map((c,i)=><p key={i}>{label(plan.rowField,c.row)} · {label(plan.columnField,c.column)} — {c.actual}/{c.target} ข้อ {c.actual<c.target&&<button disabled={busy} className="btn ghost sm" onClick={()=>{setFilter(c);setStep('select');}}>เลือกเพิ่ม {c.target-c.actual} ข้อ</button>}{c.actual>c.target&&` · เกิน ${c.actual-c.target} ข้อ`}</p>)}{!!stats.unmatched&&<p role="status">มี {stats.unmatched} ข้อนอกตาราง ให้ปรับสัดส่วนหรือนำข้อออกก่อนพร้อมใช้</p>}</>}
 {step==='review'&&kind==='mcq'&&<section className="set-coverage"><div className="set-heading"><h3>Blueprint coverage (heatmap)</h3><div className="row" style={{gap:6}}>{[['set','ข้อในชุดนี้'],['bank','ทั้งคลัง']].map(([v,l])=><button key={v} type="button" className={'status-filter'+(covScope===v?' selected':'')} aria-pressed={covScope===v} onClick={()=>setCovScope(v)}>{l}</button>)}</div></div>
 <div className="mk" style={{margin:'8px 0 6px'}}>หมวด NL × ภารกิจแพทย์</div>
 <div className="tablewrap" style={{boxShadow:'none'}}><Heat transpose cols={{axis:'ภารกิจ',items:bp.tasks.map(t=>({label:t.name,title:t.name}))}} rows={bp.domains.map(d=>({label:domainLabel(d),title:d.title}))} matrix={covTask}/></div>
 <div className="mk" style={{margin:'16px 0 6px'}}>หมวด NL × สาขา</div>
 {covSpecs.length===0?<p className="empty">{covScope==='set'?'ยังไม่มีข้อในชุดที่ระบุสาขา':'ยังไม่มีข้อสอบที่ระบุสาขา'}</p>:<div className="tablewrap" style={{boxShadow:'none'}}><Heat transpose cols={{axis:'สาขา',items:covSpecs.map(s=>({label:s.name_en||s.name_th,title:s.name_th}))}} rows={bp.domains.map(d=>({label:domainLabel(d),title:d.title}))} matrix={covSpec}/></div>}
 </section>}
 {step==='select'&&<section className="set-picker"><div className="set-heading"><h3>เพิ่มจากคลัง {kind.toUpperCase()}</h3><button className="btn ghost sm" disabled={busy} onClick={()=>run(()=>load(sel))}>รีเฟรชคลัง</button></div><label>ค้นหา{kind==='mcq'?'โจทย์ที่อนุมัติแล้ว':'ชื่อเคส'}<input value={search} onChange={e=>setSearch(e.target.value)}/></label>{kind==='mcq'&&<label>กรองตามระบบโรค (ICD)<select value={pickIcd} onChange={e=>setPickIcd(e.target.value)}><option value="">ทุกระบบ</option>{ICD_SYSTEMS.map(s=><option key={s.code} value={String(s.code)}>{s.roman}. {s.th}</option>)}</select></label>}{filter&&<p>เฉพาะ {label(plan.rowField,filter.row)} · {label(plan.columnField,filter.column)} <button className="btn ghost sm" onClick={()=>setFilter(null)}>แสดงทั้งหมด</button></p>}{!available.length&&<p className="empty">ยังไม่มี{kind==='mcq'?'ข้อสอบที่อนุมัติ':'เคส'}ตามเงื่อนไขนี้{kind==='mcq'&&pickIcd?' — แนะนำให้ออกข้อใหม่ในระบบนี้':''}</p>}{available.map(p=>{const chosen=items.some(x=>String(x.item_id||x.case_id)===String(p.id));const q=kind==='mcq'?quality(p):null;const yr=beYear(p.created_at);return <article key={p.id}><div><p>{p.title.slice(0,240)}</p>{kind==='meq'?<small>{p.document?.stages?.length||0} ตอน · ปีการศึกษา {p.academic_year}</small>:<small className="muted">{p.is_sample?'🧪 ตัวอย่าง ศรว. (ใช้ได้เฉพาะรอบ demo) · ':''}{p.icd_system?(ICD_SYSTEMS.find(s=>s.code===p.icd_system)?.roman+' · '):''}{yr?('ออกปี '+yr+' · '):''}{p.physician_task?((TASK_SHORT[p.physician_task]||p.physician_task)+' · '):''}คุณภาพ: <span className={q.cls}>{q.label}</span>{q.hasStats?(' ('+q.detail+')'):''} · {usedNote(p)}</small>}</div><div className="row" style={{gap:4,flexWrap:'wrap'}}>{kind==='mcq'&&<button className="btn ghost sm" disabled={busy} onClick={()=>openView(p.id)}>ดู</button>}{kind==='mcq'&&<button className="btn ghost sm" disabled={busy} title="สร้างข้อคู่ขนาน" onClick={()=>parallel(p.id)}>ออกคู่ขนาน</button>}<button className="btn ghost sm" disabled={busy||chosen} onClick={()=>add(p)}>{chosen?'เลือกแล้ว':'เพิ่ม'}</button></div></article>;})}</section>}
 <div className="set-actions">{kind==='mcq'&&<button className="btn ghost" onClick={()=>setStep('plan')}>← แก้ Table of Specifications</button>}{step==='select'?<button className="btn" onClick={()=>setStep('review')}>ตรวจชุดข้อสอบ →</button>:<><button className="btn ghost" onClick={()=>setStep('select')}>กลับไปเพิ่มข้อสอบ</button><button className="btn" disabled={busy||dirty||(!items.length)||(kind==='mcq'&&!stats.complete&&sel.status!=='ready')} onClick={ready}>{sel.status==='ready'?'ยกเลิกพร้อมใช้ (delivery)':'ยืนยันพร้อมใช้ (delivery)'}</button></>}</div></>}
 </>}</section></div>
 {viewItem&&<ItemPreview sb={sb} bp={bp} item={viewItem} canWrite canApprove notify={notify} onChanged={()=>run(()=>load(sel))} onEdit={()=>{const it=viewItem;setViewItem(null);setEditItem(it);}} onClose={()=>setViewItem(null)}/>}
 {editItem&&<ItemEditor sb={sb} bp={bp} item={editItem} canApprove notify={notify} onClose={()=>setEditItem(null)} onSaved={()=>{setEditItem(null);run(()=>load(sel));loadSets();}}/>}
 {autoPlan&&<div className="overlay" onClick={e=>e.target===e.currentTarget&&setAutoPlan(null)}><div className="modal">
 <div className="row" style={{justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
  <h3>ชุดที่ระบบเสนอ — เลือกแล้ว {autoPlan.sel.size} จาก {autoPlan.need} ข้อที่ยังขาด</h3>
  <button className="btn ghost sm" onClick={()=>setAutoPlan(null)}>ปิด</button>
 </div>
 {autoPlan.gaps.length>0&&<div className="delivery-alert" role="alert" style={{marginBottom:10}}>
  คลังไม่มีข้อพอในบางช่อง ต้องออกข้อใหม่ — {autoPlan.gaps.map(g=>g.label+' ขาด '+g.short).join(' · ')}
 </div>}
 {!autoPlan.picks.length?<p className="empty">ไม่มีข้อในคลังที่ใช้เติมช่องที่ขาดได้เลย</p>:<>
  <div className="tablewrap" style={{maxHeight:'58vh',overflowY:'auto'}}><table><thead><tr><th/><th>ช่องในตารางสเปก</th><th>โจทย์</th><th>เหตุผลที่เลือก</th></tr></thead><tbody>
   {autoPlan.picks.map(p=>{const on=autoPlan.sel.has(p.id);return <tr key={p.id} className={'magic-row'+(on?' checked':'')} onClick={()=>toggleAuto(p.id)}>
    <td><input type="checkbox" className="magic-check" checked={on} onChange={()=>toggleAuto(p.id)} onClick={e=>e.stopPropagation()}/></td>
    <td style={{whiteSpace:'nowrap'}}>{p.cellLabel}</td>
    <td>{poolTitle(p.id)}</td>
    <td className={p.tested?'gap-ok':''}>{p.reason}</td>
   </tr>;})}
  </tbody></table></div>
  <div className="row" style={{justifyContent:'space-between',gap:8,marginTop:10,flexWrap:'wrap'}}>
   <button className="btn ghost" disabled={busy} onClick={()=>buildAuto(String(Date.now()))}>↻ สุ่มชุดใหม่</button>
   <div className="row" style={{gap:8}}>
    <button className="btn ghost" onClick={()=>setAutoPlan(null)}>ยกเลิก</button>
    <button className="btn" disabled={busy||autoPlan.sel.size===0} onClick={confirmAuto}>เพิ่ม {autoPlan.sel.size} ข้อเข้าชุด</button>
   </div>
  </div>
 </>}
</div></div>}
{magicPick&&<div className="overlay" onClick={e=>e.target===e.currentTarget&&setMagicPick(null)}><div className="modal"><div className="row" style={{justifyContent:'space-between',alignItems:'center',marginBottom:10}}><h3>เลือกข้อที่จะเติม — {magicPick.label} (แนะนำ {magicPick.need})</h3><button className="btn ghost sm" onClick={()=>setMagicPick(null)}>ปิด</button></div>{!magicPick.cands.length?<p className="empty">ไม่มีข้อในคลังที่ตรงเงื่อนไข — แนะนำให้ออกข้อใหม่</p>:<><p className="set-note">ติ๊กเลือกข้อที่ต้องการ (ระบบติ๊กข้อแนะนำให้แล้ว {magicPick.need} ข้อ — ปรับได้) · “คุณภาพ” มาจากสถิติการสอบจริง (ความยาก p · อำนาจจำแนก r · จำนวนผู้ตอบ n) · กด “ดู” เพื่อกางโจทย์ด้านล่าง · แก้ไขข้อเดิมไม่ได้ ให้ “ออกคู่ขนาน” แทน</p><div className="tablewrap" style={{maxHeight:'60vh',overflowY:'auto'}}><table><thead><tr><th/><th>โจทย์ / ปีที่ออก · ภารกิจ</th><th>คุณภาพ (จากคะแนน)</th><th/></tr></thead><tbody>{magicPick.cands.map(p=>{const q=quality(p);const on=magicPick.sel.has(p.id);const yr=beYear(p.created_at);const dt=magicDetail[p.id];return [<tr key={p.id} className={'magic-row'+(on?' checked':'')} onClick={()=>toggleMagic(p.id)}><td><input type="checkbox" className="magic-check" checked={on} onChange={()=>toggleMagic(p.id)} onClick={e=>e.stopPropagation()}/></td><td>{(p.title||'').slice(0,140)}<div className="muted" style={{fontSize:11}}>{yr?('ออกปี '+yr):'ปีไม่ระบุ'}{p.physician_task?(' · '+(TASK_SHORT[p.physician_task]||p.physician_task)):''}{p.icd_system?(' · '+(ICD_SYSTEMS.find(s=>s.code===p.icd_system)?.roman||'')):''} · {usedNote(p)}</div></td><td className={q.cls}>{q.label}<div className="muted" style={{fontSize:11}}>{q.detail}</div></td><td><div className="row" style={{gap:4}}><button className="btn ghost sm" disabled={busy} onClick={e=>{e.stopPropagation();toggleMagicView(p.id);}}>{magicOpen===p.id?'ซ่อน':'ดู'}</button><button className="btn ghost sm" disabled={busy} title="สร้างข้อคู่ขนาน" onClick={e=>{e.stopPropagation();parallel(p.id);}}>ออกคู่ขนาน</button></div></td></tr>,
 magicOpen===p.id&&<tr key={p.id+'-d'} className="magic-detail"><td colSpan={4} style={{background:'var(--surface-2)'}}>{!dt?<p className="muted" style={{margin:0}}>กำลังโหลดโจทย์…</p>:<div><div className="pv-stem" style={{whiteSpace:'pre-wrap',marginBottom:8}}>{dt.ver?.stem||'—'}</div>{(dt.options||[]).map(o=><div key={o.id} className={'pv-opt'+(o.is_correct?' correct':'')} style={{marginBottom:4}}><b>{o.label}.</b> {o.body}{o.is_correct&&<span className="pv-badge">เฉลย</span>}</div>)}{(dt.ver?.explanation||dt.ver?.rationale)&&<div className="muted" style={{marginTop:8,whiteSpace:'pre-wrap'}}>{dt.ver.explanation||dt.ver.rationale}</div>}</div>}</td></tr>];})}</tbody></table></div><div className="row" style={{justifyContent:'flex-end',gap:8,marginTop:10}}><button className="btn ghost" onClick={()=>setMagicPick(null)}>ยกเลิก</button><button className="btn" disabled={busy||magicPick.sel.size===0} onClick={confirmMagic}>เพิ่ม {magicPick.sel.size} ข้อที่เลือก</button></div></>}</div></div>}
 </div>;
}
