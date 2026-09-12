"use client";
import {useCallback,useEffect,useState} from 'react';
const DEFAULT_KEYS=['kind','instructions','center_id','duration_min','no_time_limit','attempts_allowed','unlimited_attempts','pass_mark','shuffle_questions','shuffle_options','allow_back','show_score','show_answers','proctor_blur','block_copy','questions_per_page','require_all','show_certificate'];
const blank=()=>{const b={title:'',kind:'mcq',source_id:'',instructions:'',center_id:'',open_at:'',close_at:'',duration_min:60,no_time_limit:false,attempts_allowed:1,unlimited_attempts:false,pass_mark:50,shuffle_questions:true,shuffle_options:false,allow_back:true,show_score:false,show_answers:false,access_code:'',pool_draw:'',proctor_blur:false,feedback_at:'',block_copy:false,questions_per_page:1,require_all:false,show_certificate:false};try{const d=JSON.parse(localStorage.getItem('cpird_round_defaults')||'null');if(d)for(const k of DEFAULT_KEYS)if(k in d)b[k]=d[k];}catch{}return b;};
const fmtAway=s=>{s=Number(s)||0;return s<60?`${s}s`:`${Math.floor(s/60)}m ${s%60}s`;};
const status={draft:'ร่าง',open:'เปิดสอบ',closed:'ปิดแล้ว',in_progress:'กำลังทำ',submitted:'ส่งแล้ว',awaiting_grade:'รอตรวจ MEQ',graded:'ตรวจแล้ว'};
function csvCell(value){const text=String(value??'');return '"'+(/^[=+\-@\t\r]/.test(text)?"'":'')+text.replaceAll('"','""')+'"';}
export default function DeliveryManager({sb}){
 const [rows,setRows]=useState([]),[sources,setSources]=useState({mcq:[],meq:[]}),[centers,setCenters]=useState([]),[form,setForm]=useState(null);
 const [ftab,setFtab]=useState('exam'),[saveDefault,setSaveDefault]=useState(false);
 const [selected,setSelected]=useState(null),[roster,setRoster]=useState([]),[grading,setGrading]=useState(null),[grades,setGrades]=useState({});
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
 const rpc=useCallback(async(action,payload={})=>{const {data,error}=await sb.rpc('delivery_manage',{action,payload});if(error)throw Error(error.message);return data;},[sb]);
 const load=useCallback(async()=>{setLoading(true);try{
  const [list,mcq,meq,c]=await Promise.all([rpc('list'),sb.from('exam_sets').select('id,name,active_state').eq('kind','mcq').in('active_state',['active','pending']).order('active_state').order('updated_at',{ascending:false}),sb.from('exam_sets').select('id,name,active_state').eq('kind','meq').in('active_state',['active','pending']).order('active_state').order('updated_at',{ascending:false}),sb.from('medical_centers').select('id,name_th,short_name').eq('is_active',true).order('display_order')]);
  for(const r of [mcq,meq,c])if(r.error)throw Error(r.error.message);
  setRows(list);setSources({mcq:mcq.data||[],meq:(meq.data||[]).map(s=>({...s,id:`set:${s.id}`}))});setCenters((c.data||[]).map(x=>({id:x.id,name:x.short_name||x.name_th})));
 }catch(e){setError(e.message);}finally{setLoading(false);}},[sb,rpc]);
 useEffect(()=>{load();},[load]);
 const run=async(fn)=>{setBusy(true);setError('');setMessage('');try{await fn();}catch(e){setError(e.message);}finally{setBusy(false);}};
 const open=e=>run(async()=>{setSelected(e);setForm(null);setGrading(null);setRoster(await rpc('roster',{id:e.id}));});
 const startCreate=()=>{setForm(blank());setFtab('exam');setSelected(null);setGrading(null);setError('');};
 const create=event=>{event.preventDefault();run(async()=>{
  if(!form.title.trim()){setFtab('exam');throw Error('กรอกชื่อรอบสอบ');}
  if(!form.source_id){setFtab('exam');throw Error('เลือกชุดข้อสอบหรือเคสก่อนบันทึก');}
  if(!form.no_time_limit&&form.kind!=='meq'&&!(Number(form.duration_min)>0)){setFtab('who');throw Error('กรอกเวลาทำ (นาที) หรือเลือกไม่จำกัดเวลา');}
  if(!form.unlimited_attempts&&!(Number(form.attempts_allowed)>0)){setFtab('who');throw Error('กรอกจำนวนครั้งที่ทำได้');}
  if(form.open_at&&form.close_at&&new Date(form.close_at)<=new Date(form.open_at)){setFtab('who');throw Error('เวลาปิดต้องอยู่หลังเวลาเปิด');}
  const payload={...form,
   duration_min:form.no_time_limit?100000:Number(form.duration_min),
   attempts_allowed:form.unlimited_attempts?9999:Number(form.attempts_allowed),
   pool_draw:(form.kind==='mcq'&&form.pool_draw)?Number(form.pool_draw):null,
   questions_per_page:(form.kind==='mcq'&&form.allow_back)?Number(form.questions_per_page)||0:1,
   feedback_at:form.feedback_at?new Date(form.feedback_at).toISOString():null,
   open_at:form.open_at?new Date(form.open_at).toISOString():null,
   close_at:form.close_at?new Date(form.close_at).toISOString():null};
  const data=await rpc('create',payload);
  if(saveDefault){try{const d={};for(const k of DEFAULT_KEYS)d[k]=form[k];localStorage.setItem('cpird_round_defaults',JSON.stringify(d));}catch{}}
  setForm(null);setSelected(data);setRoster([]);await load();setMessage('บันทึกร่างแล้ว ยังไม่เปิดให้ผู้สอบเข้าทำ'+(saveDefault?' · บันทึกค่าเริ่มต้นแล้ว':''));
 });};
 const attemptAction=(action,r,label)=>run(async()=>{
  if(action==='delete_attempt'&&!window.confirm(`ลบผลสอบของ ${r.name||r.student_id||'ผู้สอบ'} ครั้งที่ ${r.attempt_no} ถาวร?`))return;
  if(action==='reopen'&&!window.confirm(`เปิดให้ ${r.name||r.student_id||'ผู้สอบ'} สอบรอบนี้ได้อีก 1 ครั้ง?`))return;
  await rpc(action,{attempt_id:r.id});setRoster(await rpc('roster',{id:selected.id}));setMessage(label);
 });
 const emailResult=(r)=>{if(!r.email)return setError('ผู้สอบคนนี้ไม่มีอีเมลในระบบ');const pct=r.max_score>0?Math.round(r.score/r.max_score*1000)/10:null;const subject=encodeURIComponent(`ผลสอบ: ${selected.title}`);const body=encodeURIComponent(`เรียน ${r.name||''}\n\nผลสอบ "${selected.title}" ครั้งที่ ${r.attempt_no}\nคะแนน: ${r.score??'-'} / ${r.max_score??'-'}${pct!=null?` (${pct}%)`:''}\nเกณฑ์ผ่าน: ${selected.pass_mark}%${pct!=null?` · ${pct>=Number(selected.pass_mark)?'ผ่าน':'ไม่ผ่าน'}`:''}\nส่งเมื่อ: ${r.submitted_at?new Date(r.submitted_at).toLocaleString('th-TH'):'-'}\n\nคลังข้อสอบ CPIRD`);window.location.href=`mailto:${r.email}?subject=${subject}&body=${body}`;};
 const changeStatus=action=>run(async()=>{
  if(action==='publish'&&!window.confirm('ยืนยันเปิดรอบสอบนี้? ระบบจะตรึงฉบับข้อสอบและเปิดให้ผู้มีสิทธิ์ตามเวลาที่ตั้งไว้'))return;
  if(action==='close'&&!window.confirm('ปิดรับผู้เข้าสอบใหม่? ผู้ที่เริ่มแล้วจะทำต่อได้จนหมดเวลาของตน'))return;
  await rpc(action,{id:selected.id});const fresh=await rpc('list');setRows(fresh);setSelected(fresh.find(x=>x.id===selected.id));setMessage(action==='publish'?'เปิดรอบสอบแล้ว':'ปิดรับผู้เข้าสอบใหม่แล้ว');
 });
 const review=id=>run(async()=>{const data=await rpc('review',{attempt_id:id});setGrading(data);setGrades(data.grades||{});});
 const saveGrades=event=>{event.preventDefault();run(async()=>{await rpc('grade',{attempt_id:grading.id,revision:grading.revision,grades});setGrading(null);setRoster(await rpc('roster',{id:selected.id}));setMessage('บันทึกผลตรวจ MEQ แล้ว');});};
 const exportCsv=()=>{const lines=[['ผู้สอบ','รหัส','ครั้งที่','สถานะ','คะแนน','คะแนนเต็ม','เริ่ม','ส่ง'],...roster.map(r=>[r.name,r.student_id,r.attempt_no,status[r.status],r.score,r.max_score,r.started_at,r.submitted_at])];const url=URL.createObjectURL(new Blob(['﻿'+lines.map(row=>row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='ผลสอบ.csv';a.click();URL.revokeObjectURL(url);};
 const set=(k,v)=>setForm(f=>({...f,[k]:v}));
 const FT=[['exam','ข้อสอบ'],['who','ผู้สอบ & เวลา'],['during','ระหว่างสอบ'],['after','หลังส่ง']];
 return <div className="delivery"><header className="delivery-heading"><div><h1>ระบบทดสอบ · จัดรอบสอบ</h1><p>เลือกชุดข้อสอบ ตั้งค่าการสอบเป็นหมวด แล้วเปิดรอบสอบและติดตามผล</p></div><button className="btn" disabled={busy} onClick={startCreate}>สร้างรอบสอบ</button></header>{error&&<div role="alert" className="delivery-alert">{error}<button className="btn ghost sm" onClick={load}>โหลดข้อมูลอีกครั้ง</button></div>}{message&&<p role="status" className="delivery-sync">{message}</p>}
 {form?<form className="delivery-paper delivery-form" onSubmit={create}><h2>สร้างรอบสอบใหม่</h2>
  <div className="bank-status" style={{marginBottom:14}} role="tablist">{FT.map(([v,l])=><button type="button" key={v} className={'status-filter'+(ftab===v?' selected':'')} aria-pressed={ftab===v} onClick={()=>setFtab(v)}>{l}</button>)}</div>
  <fieldset disabled={busy} style={{border:0,padding:0,margin:0}} onChangeCapture={()=>{}}>
   <div hidden={ftab!=='exam'}>
    <label>ชื่อรอบสอบ<input maxLength={300} value={form.title} onChange={e=>set('title',e.target.value)}/></label>
    <div className="grid2"><label>รูปแบบ<select value={form.kind} onChange={e=>setForm(f=>({...f,kind:e.target.value,source_id:''}))}><option value="mcq">MCQ · เลือกคำตอบ</option><option value="meq">MEQ · เปิดทีละตอน</option></select></label>
     <label>{form.kind==='mcq'?'ชุด MCQ':'ชุด MEQ'}<select value={form.source_id} onChange={e=>set('source_id',e.target.value)}><option value="">เลือกจากคลัง</option>{sources[form.kind].map(s=><option key={s.id} value={s.id}>{(s.name||s.title)+(s.active_state==='pending'?'  ⚠ กำลังเตรียม':'  ✓ ใช้งาน')}</option>)}</select></label></div>
    {!sources[form.kind].length&&<p className="muted">ยังไม่มี{form.kind==='mcq'?'ชุด MCQ':'ชุด MEQ'}ที่ “ใช้งาน/กำลังเตรียม” — ไปที่เมนู “สร้างชุดข้อสอบ” แล้วตั้งสถานะชุด</p>}
    {(()=>{const s=sources[form.kind].find(x=>String(x.id)===String(form.source_id));return s&&s.active_state==='pending'?<p className="delivery-alert" role="alert">⚠ ชุดนี้ยัง “กำลังเตรียม” (pending) — โปรดตรวจสอบความครบถ้วนก่อนเปิดสอบจริง</p>:null;})()}
    <label>คำชี้แจงก่อนสอบ<textarea rows={4} value={form.instructions} onChange={e=>set('instructions',e.target.value)}/></label>
    {form.kind==='mcq'&&<label>สุ่มจำนวนข้อจากชุด (question pool)<input type="number" min="1" step="1" value={form.pool_draw} onChange={e=>set('pool_draw',e.target.value)} placeholder="เว้นว่าง = ใช้ทุกข้อในชุด · ใส่ N = สุ่ม N ข้อ/คน"/></label>}
   </div>
   <div hidden={ftab!=='who'}>
    <label>กลุ่มผู้สอบ (ศูนย์แพทย์)<select value={form.center_id} onChange={e=>set('center_id',e.target.value)}><option value="">ผู้เข้าสู่ระบบทุกศูนย์</option>{centers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <div className="grid2"><label>เวลาเปิด<input type="datetime-local" value={form.open_at} onChange={e=>set('open_at',e.target.value)}/></label><label>เวลาสิ้นสุดรอบสอบ<input type="datetime-local" value={form.close_at} onChange={e=>set('close_at',e.target.value)}/></label></div>
    <p className="muted">เวลาตามเครื่องของคุณ · ผู้สอบทุกคนต้องส่งไม่เกินเวลาสิ้นสุดรอบสอบ</p>
    <div className="grid3">
     <label>เวลาทำ (นาที)<input disabled={form.kind==='meq'||form.no_time_limit} type="number" min="1" max="1440" step="1" value={form.no_time_limit?'':form.duration_min} onChange={e=>set('duration_min',e.target.value)} placeholder={form.no_time_limit?'ไม่จำกัด':''}/></label>
     <label>จำนวนครั้ง<input disabled={form.unlimited_attempts} type="number" min="1" max="100" step="1" value={form.unlimited_attempts?'':form.attempts_allowed} onChange={e=>set('attempts_allowed',e.target.value)} placeholder={form.unlimited_attempts?'ไม่จำกัด':''}/></label>
     <label>เกณฑ์ผ่าน (%)<input type="number" min="0" max="100" step="0.01" value={form.pass_mark} onChange={e=>set('pass_mark',e.target.value)}/></label>
    </div>
    {form.kind!=='meq'&&<label className="delivery-check"><input type="checkbox" checked={form.no_time_limit} onChange={e=>set('no_time_limit',e.target.checked)}/>ไม่จำกัดเวลาทำ (ทำได้จนถึงเวลาสิ้นสุดรอบสอบ)</label>}
    <label className="delivery-check"><input type="checkbox" checked={form.unlimited_attempts} onChange={e=>set('unlimited_attempts',e.target.checked)}/>ไม่จำกัดจำนวนครั้งที่ทำ</label>
    {form.kind==='meq'&&<p className="muted">MEQ ใช้เวลาของแต่ละตอนจากเคส ระบบรวมเวลาให้อัตโนมัติเมื่อเปิดรอบสอบ</p>}
    <label>รหัสเข้าสอบ (เว้นว่าง = ไม่ต้องใช้รหัส)<input autoComplete="off" maxLength={100} value={form.access_code} onChange={e=>set('access_code',e.target.value)}/></label>
   </div>
   <div hidden={ftab!=='during'}>
    {form.kind==='mcq'?<>
     <label className="delivery-check"><input type="checkbox" checked={form.shuffle_questions} onChange={e=>set('shuffle_questions',e.target.checked)}/>สลับลำดับข้อ (ผู้สอบแต่ละคนได้ลำดับต่างกัน)</label>
     <label className="delivery-check"><input type="checkbox" checked={form.shuffle_options} onChange={e=>set('shuffle_options',e.target.checked)}/>สลับตัวเลือก (A–E)</label>
     <label className="delivery-check"><input type="checkbox" checked={form.allow_back} onChange={e=>set('allow_back',e.target.checked)}/>ย้อนกลับแก้คำตอบได้ (ปิด = ทำทีละข้อ ห้ามย้อน)</label>
    </>:<p className="muted">MEQ เปิดทีละตอนและล็อกตอนก่อนหน้าโดยอัตโนมัติ · ไม่สลับโจทย์</p>}
    <label className="delivery-check"><input type="checkbox" checked={form.proctor_blur} onChange={e=>set('proctor_blur',e.target.checked)}/>เฝ้าระวังการสลับแท็บ/ออกจากหน้าจอ — แจ้งเตือนผู้สอบและบันทึกจำนวนครั้ง + เวลาที่ออกจากจอ (anti-cheat)</label>
    <label className="delivery-check"><input type="checkbox" checked={form.block_copy} onChange={e=>set('block_copy',e.target.checked)}/>ป้องกันคัดลอก / คลิกขวา / เลือกข้อความ ระหว่างสอบ (print/copy/paste)</label>
    {form.kind==='mcq'&&<label>จำนวนข้อต่อหน้า<select value={form.allow_back?form.questions_per_page:1} disabled={!form.allow_back} onChange={e=>set('questions_per_page',Number(e.target.value))}><option value={1}>1 ข้อต่อหน้า</option><option value={0}>ทุกข้อในหน้าเดียว (เลื่อนดูทั้งชุด)</option></select></label>}
    {form.kind==='mcq'&&!form.allow_back&&<p className="muted">โหมด "ห้ามย้อน" จะบังคับ 1 ข้อต่อหน้าเสมอ</p>}
    <label className="delivery-check"><input type="checkbox" checked={form.require_all} onChange={e=>set('require_all',e.target.checked)}/>บังคับตอบให้ครบทุกข้อก่อนส่ง (ระบบไม่รับส่งถ้ายังมีข้อว่าง)</label>
   </div>
   <div hidden={ftab!=='after'}>
    <label className="delivery-check"><input type="checkbox" checked={form.show_score} onChange={e=>set('show_score',e.target.checked)}/>แสดงคะแนนหลังส่ง / ตรวจเสร็จ</label>
    <label className="delivery-check"><input type="checkbox" checked={form.show_answers} onChange={e=>set('show_answers',e.target.checked)}/>เปิดเฉลย / feedback รายข้อ หลังส่ง (MCQ) หรือหลังตรวจ (MEQ)</label>
    <label>เปิดเฉลย/feedback ตั้งแต่เวลา<input type="datetime-local" disabled={!form.show_answers} value={form.feedback_at} onChange={e=>set('feedback_at',e.target.value)}/></label>
    <p className="muted">เว้นว่าง = เปิดเฉลยทันทีที่ส่ง/ตรวจเสร็จ · กำหนดเวลา = เฉลยจะเปิดให้ผู้สอบดูเมื่อถึงเวลานั้น (เช่น หลังปิดรอบสอบทั้งหมด)</p>
    <label className="delivery-check"><input type="checkbox" checked={form.show_certificate} onChange={e=>set('show_certificate',e.target.checked)}/>แสดงใบประกาศ (certificate) ให้ผู้สอบที่ผ่านเกณฑ์ ดู/พิมพ์ได้หลังส่ง</label>
    <p className="muted">การตั้งค่าทั้งหมดจะถูกตรึงเมื่อเปิดรอบสอบ เพื่อให้ผู้สอบใช้เงื่อนไขเดียวกัน</p>
   </div>
  </fieldset>
  <div className="delivery-actions" style={{alignItems:'center'}}><label className="delivery-check" style={{marginRight:'auto'}}><input type="checkbox" checked={saveDefault} onChange={e=>setSaveDefault(e.target.checked)}/>บันทึกการตั้งค่านี้เป็นค่าเริ่มต้นของฉัน</label><button type="button" className="btn ghost" disabled={busy} onClick={()=>setForm(null)}>ยกเลิก</button><button className="btn" disabled={busy}>บันทึกร่าง</button></div></form>:
 grading?<form className="delivery-paper" onSubmit={saveGrades}><h2>ตรวจคำตอบ MEQ</h2><p>ให้คะแนนแต่ละคำถามตามเกณฑ์ แล้วบันทึกผลตรวจ</p>{grading.paper.map((s,i)=><section key={i} className="delivery-grading-stage"><h3>ตอนที่ {i+1}: {s.title}</h3><p className="delivery-text">{s.scenario}</p>{s.questions.map(q=><div key={q.id} className="delivery-grade-question"><h3>{q.prompt}</h3><p className="delivery-text">คำตอบผู้สอบ: {grading.answers[q.id]||'ไม่ได้ตอบ'}</p><details><summary>แนวคำตอบและเกณฑ์คะแนน</summary><p className="delivery-text">{q.modelAnswer}</p><p className="delivery-text">{q.rubric}</p></details><div className="grid2"><label>คะแนน (เต็ม {q.points})<input required type="number" min="0" max={q.points} step="0.01" disabled={busy} value={grades[q.id]?.points??''} onChange={e=>setGrades(g=>({...g,[q.id]:{...g[q.id],points:e.target.value}}))}/></label><label>ข้อเสนอแนะ<input disabled={busy} value={grades[q.id]?.comment||''} onChange={e=>setGrades(g=>({...g,[q.id]:{...g[q.id],comment:e.target.value}}))}/></label></div></div>)}</section>)}<div className="delivery-actions"><button type="button" className="btn ghost" disabled={busy} onClick={()=>setGrading(null)}>กลับ</button><button className="btn" disabled={busy}>บันทึกผลตรวจ</button></div></form>:
 selected?<section className="delivery-paper"><button className="btn ghost sm" onClick={()=>setSelected(null)}>กลับรายการรอบสอบ</button><h2>{selected.title}</h2><p>{selected.kind.toUpperCase()} · {status[selected.status]} · {selected.duration_min>=100000?'ไม่จำกัดเวลา':selected.duration_min+' นาที'} · {selected.attempts_allowed>=9999?'ไม่จำกัดครั้ง':selected.attempts_allowed+' ครั้ง'} · เกณฑ์ผ่าน {selected.pass_mark}%</p><p>การย้อนกลับ: {selected.allow_back?'อนุญาต':'ไม่อนุญาต'} · สลับข้อ: {selected.shuffle_questions?'ใช่':'ไม่'} · สลับตัวเลือก: {selected.shuffle_options?'ใช่':'ไม่'} · คะแนน: {selected.show_score?'แสดง':'ซ่อน'} · เฉลย: {selected.show_answers?'เปิด':'ปิด'}</p><p>{selected.pool_draw>0?`สุ่มจากคลัง ${selected.pool_draw} ข้อ/คน`:'ใช้ทุกข้อในชุด'} · anti-cheat (เฝ้าออกจอ): {selected.proctor_blur?'เปิด':'ปิด'} · เปิดเฉลย: {selected.feedback_at?new Date(selected.feedback_at).toLocaleString('th-TH'):'ทันทีเมื่อส่ง/ตรวจ'}</p><p className="delivery-text">{selected.instructions}</p><div className="row">{selected.status!=='open'?<button className="btn" disabled={busy} onClick={()=>changeStatus('publish')}>เปิดรอบสอบ</button>:<button className="btn danger" disabled={busy} onClick={()=>changeStatus('close')}>ปิดรับผู้สอบใหม่</button>}<button className="btn ghost" disabled={busy} onClick={()=>open(selected)}>รีเฟรชผู้สอบ</button><button className="btn ghost" disabled={!roster.length} onClick={exportCsv}>ส่งออกผล CSV</button></div><h3 className="delivery-subheading">ผู้เข้าสอบ {roster.length} ครั้ง · รอตรวจ {roster.filter(x=>x.status==='awaiting_grade').length}</h3><div className="tablewrap"><table><thead><tr><th>ผู้สอบ</th><th>ครั้งที่</th><th>สถานะ</th><th>คะแนน</th><th>Monitor</th><th>จัดการ</th></tr></thead><tbody>{!roster.length?<tr><td colSpan="6">ยังไม่มีผู้เข้าสอบ</td></tr>:roster.map(r=><tr key={r.id}><td>{r.name||r.student_id||'ผู้สอบ'}{r.extra>0&&<div className="muted" style={{fontSize:11}}>โควตาเพิ่ม +{r.extra}</div>}</td><td>{r.attempt_no}</td><td>{r.status==='in_progress'&&new Date(r.expires_at)<new Date()?'หมดเวลา · รอผู้สอบเชื่อมต่อเพื่อสรุปผล':status[r.status]}</td><td>{r.score==null?'—':`${r.score}/${r.max_score}`}</td><td>{r.blur_count?<span className="pill retired" title="จำนวนครั้งที่ออกจากจอ · เวลารวม">{r.blur_count} ครั้ง · {fmtAway(r.away_seconds)}</span>:<span className="muted">ไม่มีเหตุการณ์</span>}</td><td><div className="row" style={{gap:4,flexWrap:'wrap'}}>{selected.kind==='meq'&&r.status!=='in_progress'&&<button className="btn ghost sm" disabled={busy} onClick={()=>review(r.id)}>ตรวจ MEQ</button>}{r.status!=='in_progress'&&<button className="btn ghost sm" disabled={busy} title="ให้สอบรอบนี้ได้อีก 1 ครั้ง" onClick={()=>attemptAction('reopen',r,'เปิดให้สอบใหม่อีก 1 ครั้งแล้ว')}>🔁 เปิดสอบใหม่</button>}{r.status!=='in_progress'&&<button className="btn ghost sm" disabled={busy||!r.email} title={r.email||'ไม่มีอีเมล'} onClick={()=>emailResult(r)}>✉ อีเมลผล</button>}<button className="btn ghost sm" style={{color:'var(--stop)'}} disabled={busy} onClick={()=>attemptAction('delete_attempt',r,'ลบผลสอบแล้ว')}>🗑 ลบผล</button></div></td></tr>)}</tbody></table></div><p className="muted" style={{marginTop:8}}>ดูวิเคราะห์ผลเชิงลึก (รายคน/ศูนย์/ชุด/รายข้อ) ได้ที่เมนู “ดูคะแนนสอบ”</p></section>:
 loading?<p role="status">กำลังโหลดรอบสอบ…</p>:!rows.length?<section className="delivery-paper"><h2>ยังไม่มีรอบสอบ</h2><p>สร้างชุด MCQ หรือเคส MEQ ในคลังก่อน จากนั้นสร้างรอบสอบเพื่อตั้งเวลาและผู้มีสิทธิ์</p></section>:<div className="delivery-list">{rows.map(e=><article className="delivery-row" key={e.id}><div><h2>{e.title}</h2><p>{e.kind.toUpperCase()} · {status[e.status]} · {e.duration_min>=100000?'ไม่จำกัดเวลา':e.duration_min+' นาที'}</p></div><button className="btn ghost" disabled={busy} onClick={()=>open(e)}>ตั้งค่าและผลสอบ</button></article>)}</div>}
 </div>;
}
