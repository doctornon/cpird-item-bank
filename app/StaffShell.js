"use client";
import {useEffect,useRef,useState} from 'react';
const PREVIEW_ALLOWED=new Set(['home','schedule','take','apply']);
const PREVIEW_GROUPS=[
 ['ภาพรวม',[['home','หน้าแรก'],['dashboard','แดชบอร์ด'],['schedule','กำหนดการ & ประกาศ ศรว.'],['apply','สมัคร/แก้ไขใบสมัคร']]],
 ['คลังข้อสอบ',[['bank','คลัง MCQ'],['meq','คลัง MEQ'],['mybank','คลังข้อสอบของฉัน'],['theater','วิพากษ์ข้อสอบ']]],
 ['ระบบทดสอบ',[['sets','สร้างชุดข้อสอบ'],['assign','จัดรอบการสอบและตั้งค่า']]],
 ['ห้องสอบของฉัน',[['take','ทำข้อสอบ (ตัวอย่าง)'],['scores','ดูคะแนนสอบ'],['analyze','วิเคราะห์ผลสอบ'],['cert','ประกาศนียบัตร']]],
];
export default function StaffShell({tab,onNavigate,profile,roles=[],superAdmin,isReviewer,isAnalyst,isCenterStaff,showApply,canWrite,canSets,canFullBank,preview,onLock,onSignOut,children}) {
 const [expanded,setExpanded]=useState(false);
 const [collapsed,setCollapsed]=useState(false);
 const [compact,setCompact]=useState(false);
 const menu=useRef(null);
 useEffect(()=>{
  const media=window.matchMedia('(max-width: 1100px)');
  const sync=()=>{setCompact(media.matches);setExpanded(false);};
  sync();media.addEventListener('change',sync);return()=>media.removeEventListener('change',sync);
 },[]);
 useEffect(()=>{
  if(!expanded)return;
  const escape=e=>{if(e.key==='Escape'){setExpanded(false);menu.current?.focus();}};
  window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);
 },[expanded]);
 const groups=preview?PREVIEW_GROUPS:[
  ['ภาพรวม', [['home','หน้าแรก'],...(canFullBank?[['dashboard','แดชบอร์ด']]:[]),['schedule','กำหนดการ & ประกาศ ศรว.'],...(showApply?[['apply','สมัครเป็นผู้ออกข้อสอบ']]:[])]],
  ['ศูนย์แพทย์ของฉัน', [...(isCenterStaff?[['students','บัญชีนักศึกษาของศูนย์'],['announce','ประกาศสนามสอบ']]:[])]],
  ['คลังข้อสอบ', [...(canFullBank?[['bank','คลัง MCQ'],['meq','คลัง MEQ']]:[]),...(canWrite?[['mybank','คลังข้อสอบของฉัน']]:[]),...(isReviewer?[['theater','วิพากษ์ข้อสอบ']]:[])]],
  ['ระบบทดสอบ', [...(canSets?[['sets','สร้างชุดข้อสอบ']]:[]),...(superAdmin?[['assign','จัดรอบการสอบและตั้งค่า']]:[])]],
  ['ห้องสอบของฉัน', [['take','ทำข้อสอบ'],...(isAnalyst?[['scores','ดูคะแนนสอบ'],['analyze','วิเคราะห์ผลสอบ'],['cert','ประกาศนียบัตร']]:[])]],
  ['จัดการ', [...(canWrite?[['import','นำเข้า Excel']]:[]),...(superAdmin?[['comp','ค่าตอบแทนข้อสอบ']]:[]),...(superAdmin?[['accounts','จัดการบัญชีผู้ใช้'],['roles','จัดการสิทธิ์']]:[])]]
 ];
 const navigate=key=>{if(preview&&!PREVIEW_ALLOWED.has(key))return;onNavigate(key);setExpanded(false);};
 return <div className={'staff-shell'+(collapsed?' nav-collapsed':'')}>
  <header className="staff-header">
   <button ref={menu} className="btn ghost sm staff-menu" aria-label={compact?'เมนูหลัก':collapsed?'แสดงเมนูหลัก':'ย่อเมนูหลัก'} aria-expanded={compact?expanded:!collapsed} aria-controls="staff-navigation" onClick={()=>compact?setExpanded(!expanded):setCollapsed(!collapsed)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
   <img src="/cpird-logo.png" alt="" className="brand-logo" onError={e=>{e.currentTarget.style.display='none';}}/><span className="brand">ระบบจัดทดสอบและวัดผล สพพ.</span><span className="grow"/>
   {onLock&&<button type="button" className="lock-toggle" role="switch" aria-checked={false} title="ล็อกหน้าจอเพื่อความปลอดภัย" onClick={onLock}><span className="lock-toggle-track"><span className="lock-toggle-thumb"/></span><span className="lock-toggle-label">🔓 ล็อกหน้าจอ</span></button>}
   <span className="who">{profile?.full_name||profile?.email}<br/><span className="muted">{superAdmin?'ผู้ดูแลระบบ':roles.join(', ')}</span></span>
   <button className="btn ghost sm staff-signout" onClick={onSignOut}>ออก</button>
  </header>
  <div className="staff-body">
   {expanded&&<button className="staff-backdrop" aria-label="ปิดเมนู" tabIndex={-1} onClick={()=>{setExpanded(false);menu.current?.focus();}}/>}
   <nav id="staff-navigation" aria-label="เมนูหลัก" className={'staff-nav'+(expanded?' expanded':'')}>
    {groups.filter(([,links])=>links.length).map(([title,links])=><section key={title}><p>{title}</p>{links.map(([key,label])=>{const locked=preview&&!PREVIEW_ALLOWED.has(key);return <button key={key} aria-current={tab===key?'page':undefined} disabled={locked} title={locked?'จะเปิดใช้งานเมื่อได้รับการแต่งตั้ง':undefined} className={(tab===key?'active':'')+(locked?' locked':'')} onClick={()=>navigate(key)}>{label}{locked?' 🔒':''}</button>;})}</section>)}
    <div className="staff-mobile-account"><p>{profile?.full_name||profile?.email}</p><button onClick={onSignOut}>ออกจากระบบ</button></div>
   </nav>
   <main className="staff-content">{children}</main>
  </div>
 </div>;
}
