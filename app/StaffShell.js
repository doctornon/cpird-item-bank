"use client";
import {useState} from 'react';
export default function StaffShell({tab,onNavigate,profile,roles=[],superAdmin,canApprove,canWrite,onSignOut,children}) {
 const [expanded,setExpanded]=useState(false);
 const groups=[
  ['ภาพรวม', [['dashboard','แดชบอร์ด']]],
  ['คลังข้อสอบ', [['bank','คลัง MCQ'],['meq','คลัง MEQ'],...(canApprove?[['theater','วิพากษ์ข้อสอบ']]:[])]],
  ['การสอบ', canApprove?[['sets','สร้างชุดข้อสอบ'],['assign','จัดรอบสอบและผลสอบ']]:[]],
  ['จัดการ', [...(canWrite?[['import','นำเข้า Excel']]:[]),...(superAdmin?[['roles','จัดการสิทธิ์']]:[])]]
 ];
 return <div className="staff-shell"><header className="staff-header"><button className="btn ghost sm staff-menu" aria-expanded={expanded} aria-controls="staff-navigation" onClick={()=>setExpanded(!expanded)}>เมนู</button><span className="brand">คลังข้อสอบ CPIRD</span><span className="grow"/><button className="btn ghost sm" onClick={()=>onNavigate('take')}>โหมดทำข้อสอบ</button><span className="who">{profile?.full_name||profile?.email}<br/><span className="muted">{superAdmin?'ผู้ดูแลระบบ':roles.join(', ')}</span></span><button className="btn ghost sm" onClick={onSignOut}>ออก</button></header><div className="staff-body"><nav id="staff-navigation" aria-label="เมนูหลัก" className={'staff-nav'+(expanded?' expanded':'')}>{groups.filter(([,links])=>links.length).map(([title,links])=><section key={title}><p>{title}</p>{links.map(([key,label])=><button key={key} aria-current={tab===key?'page':undefined} className={tab===key?'active':''} onClick={()=>{onNavigate(key);setExpanded(false);}}>{label}</button>)}</section>)}</nav><main className="staff-content">{children}</main></div></div>;
}
