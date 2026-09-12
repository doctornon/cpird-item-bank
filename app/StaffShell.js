"use client";
import {useEffect,useRef,useState} from 'react';
export default function StaffShell({tab,onNavigate,profile,roles=[],superAdmin,canApprove,canWrite,onLock,onSignOut,children}) {
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
  ['ภาพรวม', [['dashboard','แดชบอร์ด']]],
  ['คลังข้อสอบ', [['bank','คลัง MCQ'],['meq','คลัง MEQ'],...(canApprove?[['theater','วิพากษ์ข้อสอบ']]:[])]],
  ['การสอบ', canApprove?[['sets','สร้างชุดข้อสอบ'],['assign','จัดรอบสอบและผลสอบ']]:[]],
  ['จัดการ', [...(canWrite?[['import','นำเข้า Excel']]:[]),...(superAdmin?[['roles','จัดการสิทธิ์']]:[])]]
 ];
 const navigate=key=>{onNavigate(key);setExpanded(false);};
 return <div className={'staff-shell'+(collapsed?' nav-collapsed':'')}>
  <header className="staff-header">
   <button ref={menu} className="btn ghost sm staff-menu" aria-label={compact?'เมนูหลัก':collapsed?'แสดงเมนูหลัก':'ย่อเมนูหลัก'} aria-expanded={compact?expanded:!collapsed} aria-controls="staff-navigation" onClick={()=>compact?setExpanded(!expanded):setCollapsed(!collapsed)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
   <span className="brand">คลังข้อสอบ CPIRD</span><span className="grow"/>
   <button className="btn ghost sm staff-take" onClick={()=>navigate('take')}>ทำข้อสอบ</button>
   {onLock&&<button className="btn ghost sm staff-lock" title="ล็อกหน้าจอ (ป้องกันผู้อื่นเข้าถึง)" aria-label="ล็อกหน้าจอ" onClick={onLock}>🔒 ล็อก</button>}
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
