"use client";
import {useEffect,useRef,useState} from 'react';
export default function StaffShell({tab,onNavigate,profile,roles=[],superAdmin,canApprove,canWrite,canSets,onLock,onSignOut,children}) {
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
 const groups=[
  ['ภาพรวม', [['dashboard','แดชบอร์ด'],['schedule','กำหนดการ & ประกาศ ศรว.']]],
  ['คลังข้อสอบ', [['bank','คลัง MCQ'],['meq','คลัง MEQ'],...(canWrite?[['mybank','คลังข้อสอบของฉัน']]:[]),...(canApprove?[['theater','วิพากษ์ข้อสอบ']]:[])]],
  ['ระบบทดสอบ', [...(canSets?[['sets','สร้างชุดข้อสอบ']]:[]),...(canApprove?[['assign','จัดรอบการสอบและตั้งค่า']]:[])]],
  ['ห้องสอบของฉัน', [['take','ทำข้อสอบ'],...(canApprove?[['scores','ดูคะแนนสอบ'],['analyze','วิเคราะห์ผลสอบ'],['cert','ประกาศนียบัตร']]:[])]],
  ['จัดการ', [...(canWrite?[['import','นำเข้า Excel']]:[]),...(canApprove?[['comp','ค่าตอบแทนข้อสอบ']]:[]),...(superAdmin?[['accounts','จัดการบัญชีผู้ใช้'],['roles','จัดการสิทธิ์']]:[])]]
 ];
 const navigate=key=>{onNavigate(key);setExpanded(false);};
 return <div className={'staff-shell'+(collapsed?' nav-collapsed':'')}>
  <header className="staff-header">
   <button ref={menu} className="btn ghost sm staff-menu" aria-label={compact?'เมนูหลัก':collapsed?'แสดงเมนูหลัก':'ย่อเมนูหลัก'} aria-expanded={compact?expanded:!collapsed} aria-controls="staff-navigation" onClick={()=>compact?setExpanded(!expanded):setCollapsed(!collapsed)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
   <img src="/cpird-logo.png" alt="" className="brand-logo" onError={e=>{e.currentTarget.style.display='none';}}/><span className="brand">คลังข้อสอบ CPIRD</span><span className="grow"/>
   {onLock&&<button type="button" className="lock-toggle" role="switch" aria-checked={false} title="ล็อกหน้าจอเพื่อความปลอดภัย" onClick={onLock}><span className="lock-toggle-track"><span className="lock-toggle-thumb"/></span><span className="lock-toggle-label">🔓 ล็อกหน้าจอ</span></button>}
   <span className="who">{profile?.full_name||profile?.email}<br/><span className="muted">{superAdmin?'ผู้ดูแลระบบ':roles.join(', ')}</span></span>
   <button className="btn ghost sm staff-signout" onClick={onSignOut}>ออก</button>
  </header>
  <div className="staff-body">
   {expanded&&<button className="staff-backdrop" aria-label="ปิดเมนู" tabIndex={-1} onClick={()=>{setExpanded(false);menu.current?.focus();}}/>}
   <nav id="staff-navigation" aria-label="เมนูหลัก" className={'staff-nav'+(expanded?' expanded':'')}>
    {groups.filter(([,links])=>links.length).map(([title,links])=><section key={title}><p>{title}</p>{links.map(([key,label])=><button key={key} aria-current={tab===key?'page':undefined} className={tab===key?'active':''} onClick={()=>navigate(key)}>{label}</button>)}</section>)}
    <div className="staff-mobile-account"><p>{profile?.full_name||profile?.email}</p><button onClick={onSignOut}>ออกจากระบบ</button></div>
   </nav>
   <main className="staff-content">{children}</main>
  </div>
 </div>;
}
