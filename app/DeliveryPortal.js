"use client";
import {useCallback,useEffect,useRef,useState} from 'react';

const date = value => value ? new Date(value).toLocaleString('th-TH') : 'ไม่กำหนด';
const clock = seconds => `${Math.floor(Math.max(0,seconds)/60).toString().padStart(2,'0')}:${(Math.max(0,seconds)%60).toString().padStart(2,'0')}`;
export default function DeliveryPortal({sb,profile,onExit,onSignOut}) {
 const [list,setList]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [intro,setIntro]=useState(null),[code,setCode]=useState(''),[agreed,setAgreed]=useState(false);
 const [attempt,setAttempt]=useState(null),[answers,setAnswers]=useState({}),[flags,setFlags]=useState({});
 const [index,setIndex]=useState(0),[filter,setFilter]=useState('all'),[review,setReview]=useState(false);
 const [busy,setBusy]=useState(false),[operation,setOperation]=useState(''),[pending,setPending]=useState(0),[seconds,setSeconds]=useState(0),[sync,setSync]=useState('');
 const current=useRef(null),patch=useRef({}),flagState=useRef({}),flight=useRef(false),offset=useRef(0),retryAt=useRef(0),flagDirty=useRef(false);
 const storageKey=id=>`cpird_delivery_${id}`;
 const rpc=useCallback(async(action,payload={})=>{
  const {data,error}=await sb.rpc('delivery_run',{action,payload});
  if(error) throw Error(error.message); return data;
 },[sb]);
 const load=useCallback(async()=>{setLoading(true);setError('');try{setList(await rpc('list'));}catch(e){setError(e.message);}finally{setLoading(false);}},[rpc]);
 useEffect(()=>{load();},[load]);
 const persist=()=>{
  if(!current.current)return;
  try{localStorage.setItem(storageKey(current.current.id),JSON.stringify({revision:current.current.revision,stage:current.current.stage,answers:patch.current,flags:flagState.current}));}
  catch{setSync('พื้นที่ในเครื่องไม่พร้อม กรุณารอให้บันทึกบนเซิร์ฟเวอร์สำเร็จก่อนออก');}
 };
 const accept=(data,{restore=false,sent={}}={})=>{
  const previous=current.current;
  if(previous && previous.id===data.id && previous.stage!==data.stage){
   if(Object.keys(patch.current).some(k=>patch.current[k]!==sent[k])) setError('ตอนก่อนหน้าถูกล็อกแล้ว คำตอบที่ส่งไม่ทันเวลาจะไม่ถูกนับ');
   patch.current={};setIndex(0);setReview(false);
  }else{
   for(const [key,value] of Object.entries(sent)) if(patch.current[key]===value)delete patch.current[key];
  }
  if(restore){
   patch.current={};
   try{
    const backup=JSON.parse(localStorage.getItem(storageKey(data.id))||'null');
    if(backup && backup.revision===data.revision && backup.stage===data.stage){patch.current=backup.answers||{};flagState.current=backup.flags||data.flags||{};}
    else {flagState.current=data.flags||{};if(backup&&Object.keys(backup.answers||{}).length)setError('พบคำตอบค้างจากข้อมูลรุ่นเก่า ระบบใช้คำตอบล่าสุดบนเซิร์ฟเวอร์เพื่อไม่เขียนทับการสอบจากอีกแท็บ');}
   }catch{flagState.current=data.flags||{};}
  }
  current.current=data;offset.current=new Date(data.server_now).getTime()-Date.now();
  setAttempt(data);setAnswers({...data.answers,...patch.current});setFlags({...flagState.current});setPending(Object.keys(patch.current).length);
  if(data.status!=='in_progress'){
   patch.current={};setReview(false);setPending(0);try{localStorage.removeItem(storageKey(data.id));}catch{}
  }else persist();
 };
 const transact=useCallback(async(action='save')=>{
  const a=current.current;if(!a||flight.current)return false;
  flight.current=true;setBusy(true);setOperation(action);const sent={...patch.current};const sentFlags=flagState.current;
  try{
   const data=await rpc(action,{attempt_id:a.id,revision:a.revision,stage:a.stage,answers:action==='paper'?{}:sent,flags:sentFlags});
   if(data.conflict){
    const fresh=await rpc('paper',{attempt_id:a.id});
    // A concurrent client or a timed stage transition changed the server state.
    patch.current={};flagState.current=fresh.flags||{};accept(fresh);
    setError('สถานะการสอบเปลี่ยนจากอีกแท็บหรือหมดเวลาตอน ระบบโหลดคำตอบล่าสุดแล้ว กรุณาตรวจคำตอบก่อนทำต่อ');return false;
   }
   if(action!=='paper'&&flagState.current===sentFlags)flagDirty.current=false;setError('');accept(data,{sent:action==='paper'?{}:sent});setSync('บันทึกบนเซิร์ฟเวอร์แล้ว');return true;
  }catch(e){setError(`${e.message} — คำตอบที่ยังไม่ส่งเก็บไว้ในเครื่อง กรุณาลองบันทึกอีกครั้ง`);return false;}
  finally{flight.current=false;setBusy(false);setOperation('');retryAt.current=Date.now()+5000;}
 },[rpc]);
 useEffect(()=>{
  if(!attempt||attempt.status!=='in_progress')return;
  const tick=()=>{
   const a=current.current;if(!a||a.status!=='in_progress')return;
   const end=a.kind==='meq'?a.stage_expires_at:a.expires_at;
   const left=Math.ceil((new Date(end).getTime()-Date.now()-offset.current)/1000);setSeconds(left);
   if(left<=0 && Date.now()>=retryAt.current)transact('paper');
  };tick();const id=setInterval(tick,1000);return()=>clearInterval(id);
 },[attempt?.id,attempt?.status,attempt?.stage,transact]);
 useEffect(()=>{
  if(!attempt||attempt.status!=='in_progress')return;
  const id=setInterval(()=>{if(Object.keys(patch.current).length||flagDirty.current)transact('save');},3000);
  const online=()=>transact('save');window.addEventListener('online',online);
  const leave=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',leave);
  return()=>{clearInterval(id);window.removeEventListener('online',online);window.removeEventListener('beforeunload',leave);};
 },[attempt?.id,attempt?.status,transact]);
 const start=async(a)=>{
  if(flight.current)return;flight.current=true;setBusy(true);setError('');
  try{const data=await rpc('start',{id:a.id,code});accept(data,{restore:true});setIntro(null);setIndex(0);setFilter('all');setSync('โหลดคำตอบล่าสุดแล้ว');}
  catch(e){setError(e.message);}finally{flight.current=false;setBusy(false);}
 };
 const openResult=async(id)=>{setBusy(true);setError('');try{accept(await rpc('paper',{attempt_id:id}),{restore:true});setIndex(0);}catch(e){setError(e.message);}finally{setBusy(false);}};
 const answer=(id,value)=>{patch.current[id]=value;setAnswers(prev=>({...prev,[id]:value}));setPending(Object.keys(patch.current).length);persist();};
 const toggleFlag=id=>{flagDirty.current=true;flagState.current={...flagState.current,[id]:!flagState.current[id]};setFlags(flagState.current);persist();transact('save');};
 const home=()=>{current.current=null;setAttempt(null);patch.current={};setIntro(null);setError('');load();};
 const alert=error&&<div className="delivery-alert" role="alert">{error}</div>;
 const header=<header className="delivery-heading"><div><h1>ห้องสอบของฉัน</h1><p>คลังข้อสอบ CPIRD · {profile?.full_name||profile?.email}</p></div><div className="row">{onExit&&<button className="btn ghost" onClick={onExit}>กลับหน้าจัดการ</button>}{onSignOut&&<button className="btn ghost" onClick={onSignOut}>ออกจากระบบ</button>}</div></header>;
 if(!attempt)return <main className="wrap section delivery">{header}{alert}{intro?<section className="delivery-paper"><button className="btn ghost" onClick={()=>setIntro(null)}>กลับรายการสอบ</button><h2>{intro.title}</h2><p>{intro.kind.toUpperCase()} · {intro.count} {intro.kind==='meq'?'ตอน':'ข้อ'} · {intro.duration_min} นาที · ทำได้ {intro.attempts_allowed} ครั้ง</p><h3>คำชี้แจงก่อนเริ่ม</h3><p className="delivery-text">{intro.instructions||'อ่านโจทย์และเลือกหรือพิมพ์คำตอบให้ครบก่อนส่งข้อสอบ'}</p><ul><li>เวลาเริ่มนับเมื่อกดเริ่มสอบ และยังเดินต่อแม้ปิดหน้าเว็บ</li><li>{intro.kind==='meq'?'เปิดทีละตอน หมดเวลาจะล็อกคำตอบและเปิดตอนถัดไป ห้ามอ่านล่วงหน้าหรือย้อนแก้ไข':intro.allow_back?'ย้อนกลับแก้คำตอบและปักหมุดเพื่อทบทวนได้':'ทำทีละข้อ เมื่อยืนยันไปข้อถัดไปแล้วจะย้อนแก้ไม่ได้'}</li><li>ระบบบันทึกคำตอบทุก 3 วินาที ตรวจสถานะบันทึกก่อนปิดหน้าต่าง</li><li>{intro.show_score?'แสดงคะแนนหลังส่ง (MEQ รออาจารย์ตรวจ)':'รอบนี้ไม่แสดงคะแนนให้ผู้สอบ'} · {intro.show_answers?'เปิดเฉลยหลังส่งและตรวจเสร็จ':'ไม่เปิดเฉลย'}</li><li>ปิดรอบสอบ: {date(intro.close_at)} — จะสิ้นสุดไม่เกินเวลาปิดนี้</li></ul>{intro.access_required&&<label>รหัสเข้าสอบ<input value={code} onChange={e=>setCode(e.target.value)} autoComplete="off" /></label>}<label className="delivery-check"><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)}/>อ่านคำชี้แจงและพร้อมเริ่มสอบ</label><button className="btn" disabled={!agreed||busy} onClick={()=>start(intro)}>{busy?'กำลังเปิดข้อสอบ…':'เริ่มสอบและจับเวลา'}</button></section>:<>{loading?<p role="status">กำลังโหลดรายการสอบ…</p>:!list.length?<section className="delivery-paper"><h2>{error?'โหลดรายการไม่สำเร็จ':'ยังไม่มีรอบสอบที่เปิดให้คุณ'}</h2><p>เมื่ออาจารย์จัดชุดข้อสอบและเปิดรอบสอบแล้ว รายการจะปรากฏที่นี่</p><button className="btn ghost" onClick={load}>โหลดรายการอีกครั้ง</button></section>:<div className="delivery-list">{list.map(a=>{const active=a.attempts?.find(t=>t.status==='in_progress');const available=a.status==='open'&&(!a.open_at||Date.now()>=new Date(a.open_at).getTime())&&(!a.close_at||Date.now()<new Date(a.close_at).getTime())&&(a.attempts?.length||0)<a.attempts_allowed;return <article key={a.id} className="delivery-row"><div><span className={"pill "+a.kind}>{a.kind.toUpperCase()}</span><h2>{a.title}</h2><p>{a.duration_min} นาที · {a.count} {a.kind==='meq'?'ตอน':'ข้อ'} · เปิด {date(a.open_at)}</p><p>ปิด {date(a.close_at)}</p><div className="row">{a.attempts?.filter(t=>t.status!=='in_progress').map(t=><button className="btn ghost sm" key={t.id} onClick={()=>openResult(t.id)} disabled={busy}>ผลครั้งที่ {t.attempt_no}{t.status==='awaiting_grade'?' · รอตรวจ':''}</button>)}</div></div><button className="btn" disabled={busy||(!active&&!available)} onClick={()=>{if(active)openResult(active.id);else{setIntro(a);setCode('');setAgreed(false);setError('');}}}>{active?'ทำต่อ / ตรวจสถานะ':available?'อ่านคำชี้แจง':'ยังไม่เปิด / ครบจำนวนครั้ง'}</button></article>;})}</div>}</>}</main>;
 if(attempt.status!=='in_progress'){
  const percent=attempt.score!=null&&attempt.max_score>0?Math.round(attempt.score/attempt.max_score*10000)/100:null;
  const qs=attempt.kind==='mcq'?attempt.paper:attempt.paper.flatMap(s=>s.questions||[]);
  return <main className="wrap section delivery">{header}{alert}<section className="delivery-paper"><h2>ส่งข้อสอบแล้ว</h2><p>{attempt.title} · ส่งเมื่อ {date(attempt.submitted_at)}</p>{attempt.status==='awaiting_grade'?<p className="delivery-result">รออาจารย์ตรวจ MEQ</p>:percent!=null?<p className="delivery-result">{attempt.score} / {attempt.max_score} คะแนน ({percent}%) · {percent>=attempt.pass_mark?'ผ่าน':'ไม่ผ่าน'}</p>:<p>รอบสอบนี้ไม่แสดงคะแนน</p>}<button className="btn ghost" onClick={home}>กลับรายการสอบ</button></section>{!qs.length?<p>ยังไม่เปิดเฉลยสำหรับรอบสอบนี้</p>:qs.map((q,i)=><section className="delivery-paper" key={q.id}><h3>ข้อ {i+1}</h3><p className="delivery-text">{q.stem||q.prompt}</p><p>คำตอบของคุณ: {attempt.answers[q.id]||'ไม่ได้ตอบ'}</p>{q.options?.map(o=><p key={o.id}>{o.id}. {o.body}{o.correct?' · คำตอบที่ถูก':''}{o.rationale?` — ${o.rationale}`:''}</p>)}<p className="delivery-text">{q.rationale||q.modelAnswer}</p>{q.rubric&&<p className="delivery-text">เกณฑ์ให้คะแนน: {q.rubric}</p>}{attempt.grades[q.id]&&<p>คะแนน {attempt.grades[q.id].points} / {q.points} · {attempt.grades[q.id].comment||''}</p>}</section>)}</main>;
 }
 const meq=attempt.kind==='meq',sequential=meq||!attempt.allow_back;
 const qs=meq?(attempt.paper[0]?.questions||[]):attempt.paper;
 const q=qs[Math.min(index,qs.length-1)];
 const answered=qs.filter(q=>String(answers[q.id]||'').trim()).length;
 const flagged=qs.filter(q=>flags[q.id]).length;
 const locked=seconds<=0||['advance','submit','paper'].includes(operation);
 return <main className="delivery delivery-active"><header className="delivery-exam-bar"><div><strong>{attempt.title}</strong><span>{meq?`MEQ · ตอนที่ ${attempt.stage+1} / ${attempt.count}`:`MCQ · ${attempt.count} ข้อ`}</span></div><div className={'delivery-clock'+(seconds<=60?' urgent':'')} role="timer" aria-label="เวลาที่เหลือ">{clock(seconds)}</div><button className="btn" onClick={()=>setReview(true)} disabled={locked}>ตรวจทานและส่ง</button></header><div className="wrap section">{alert}<div className="delivery-sync" role="status"><span>{pending?`รอบันทึก ${pending} คำตอบ`:sync||'คำตอบล่าสุดจากเซิร์ฟเวอร์'}</span><button className="btn ghost sm" disabled={busy} onClick={()=>transact(seconds<=0?'paper':'save')}>บันทึก / เชื่อมต่ออีกครั้ง</button></div>{review?<section className="delivery-paper"><h2>{sequential?'ยืนยันคำตอบ':'ตรวจทานก่อนส่ง'}</h2><p>ตอบแล้ว {answered} / {qs.length} {meq?'คำถามในตอนนี้':'ข้อ'} · ยังไม่ตอบ {qs.length-answered} · ปักหมุด {flagged}</p>{meq&&<p>หากส่งข้อสอบทั้งหมด ตอนที่ยังไม่เปิดจะไม่ได้รับคำตอบ</p>}<p>เมื่อยืนยันส่งแล้วจะไม่สามารถแก้คำตอบได้</p><div className="row"><button className="btn ghost" onClick={()=>setReview(false)} disabled={busy}>กลับไปทำต่อ</button><button className="btn" disabled={locked} onClick={()=>transact('submit')}>ยืนยันส่งข้อสอบทั้งหมด</button></div></section>:<div className="delivery-layout"><aside className="delivery-nav"><h2>{meq?'คำถามในตอนนี้':'รายการข้อสอบ'}</h2><p>ตอบแล้ว {answered}/{qs.length}</p>{!sequential&&<label>แสดงข้อ<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">ทุกข้อ</option><option value="unanswered">ยังไม่ตอบ</option><option value="flagged">ปักหมุด</option></select></label>}<nav className="qgrid" aria-label="เลือกข้อสอบ">{qs.map((item,i)=>((filter==='all'||(filter==='unanswered'&&!answers[item.id])||(filter==='flagged'&&flags[item.id]))&&<button key={item.id} className={'qbtn'+(index===i?' current':'')+(answers[item.id]?' answered':'')} aria-current={index===i?'step':undefined} aria-label={`ข้อ ${i+1}${answers[item.id]?' ตอบแล้ว':' ยังไม่ตอบ'}${flags[item.id]?' ปักหมุด':''}`} onClick={()=>setIndex(i)}>{meq?i+1:(item.position??i)+1}{flags[item.id]&&<span className="delivery-flag-dot" aria-hidden="true"/>}</button>))}</nav>{sequential&&<p>ตอนหรือข้อก่อนหน้าถูกล็อกแล้ว</p>}</aside><section className="delivery-paper">{meq&&<div className="delivery-scenario"><h2>{attempt.paper[0]?.title||`ตอนที่ ${attempt.stage+1}`}</h2><p className="delivery-text">{attempt.paper[0]?.scenario}</p></div>}{q?<><div className="delivery-question-head"><h2>ข้อ {meq?index+1:(q.position??index)+1}{meq?` · ${q.points} คะแนน`:''}</h2><button className="btn ghost sm" aria-pressed={!!flags[q.id]} disabled={locked} onClick={()=>toggleFlag(q.id)}>{flags[q.id]?'ยกเลิกปักหมุด':'ปักหมุดทบทวน'}</button></div><p className="delivery-stem">{q.stem||q.prompt}</p>{meq?<label>คำตอบ<textarea maxLength={30000} rows={8} disabled={locked} value={answers[q.id]||''} onChange={e=>answer(q.id,e.target.value)} /></label>:<fieldset className="delivery-options" disabled={locked}><legend className="sr-only">เลือกคำตอบหนึ่งข้อ</legend>{q.options?.map((o,i)=><label key={o.id} className={'delivery-option'+(answers[q.id]===o.id?' chosen':'')}><input type="radio" name={`answer-${q.id}`} checked={answers[q.id]===o.id} onChange={()=>answer(q.id,o.id)}/><span className="delivery-option-label">{String.fromCharCode(65+i)}</span><span>{o.body}</span></label>)}</fieldset>}<div className="delivery-actions"><button className="btn ghost" disabled={index===0||locked} onClick={()=>setIndex(i=>i-1)}>ข้อก่อนหน้า</button>{index<qs.length-1?<button className="btn" disabled={locked} onClick={()=>setIndex(i=>i+1)}>ข้อถัดไป</button>:sequential&&attempt.stage<attempt.count-1?<button className="btn" disabled={locked} onClick={()=>{if(window.confirm('ยืนยันล็อกคำตอบและไปต่อ? จะย้อนกลับแก้ไขไม่ได้'))transact('advance');}}>ล็อกคำตอบและไป{meq?'ตอน':'ข้อ'}ถัดไป</button>:<button className="btn" disabled={locked} onClick={()=>setReview(true)}>ตรวจทานและส่ง</button>}</div></>:<p>กำลังโหลดข้อสอบ…</p>}</section></div>}</div></main>;
}
