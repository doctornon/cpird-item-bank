"use client";
import { useEffect, useState, useCallback } from "react";
import { getSupabase } from "../lib/supabaseClient";
import StaffShell from "./StaffShell";
import Dashboard from "./Dashboard";
import Bank from "./Bank";
import MyBank from "./MyBank";
import MeqBank from "./MeqBank";
import Theater from "./Theater";
import ExamSets from "./ExamSets";
import ScoreAnalytics from "./ScoreAnalytics";
import ItemCompensation from "./ItemCompensation";
import Schedule from "./Schedule";
import Import from "./Import";
import RolesAdmin from "./RolesAdmin";
import AccountsAdmin from "./AccountsAdmin";
import Certificates from "./Certificates";
import HomeCards from "./HomeCards";
import WriterApplication from "./WriterApplication";
import CenterStudents from "./CenterStudents";
import DeliveryPortal from "./DeliveryPortal";
import DeliveryManager from "./DeliveryManager";
export default function Page() {
const sb = getSupabase();
const [session, setSession] = useState(undefined);
const [profile, setProfile] = useState(null);
const [roles, setRoles] = useState([]);
const [superAdmin, setSuperAdmin] = useState(false);
const [access, setAccess] = useState(undefined);
const [writerApp, setWriterApp] = useState(null);
const [locked, setLocked] = useState(false);
const [tab, setTab] = useState("home");
const [bankStatus, setBankStatus] = useState("");
const [toast, setToast] = useState("");
const [domains, setDomains] = useState([]);
const [subitems, setSubitems] = useState([]);
const [tasks, setTasks] = useState([]);
const [specs, setSpecs] = useState([]);
const notify = useCallback((m) => { setToast(m); setTimeout(() => setToast(""), 3200); }, []);
useEffect(() => { try { setLocked(localStorage.getItem("cpird_locked") === "1"); } catch {} }, []);
// remember the current view so a browser refresh stays on the same page instead of jumping home
useEffect(() => { try { const t = localStorage.getItem("cpird_tab"); if (t) setTab(t); } catch {} }, []);
useEffect(() => { try { localStorage.setItem("cpird_tab", tab); } catch {} }, [tab]);
const setLockedPersist = (v) => { setLocked(v); try { localStorage.setItem("cpird_locked", v ? "1" : "0"); } catch {} };
useEffect(() => {
sb.auth.getSession().then(({ data }) => setSession(data.session || null));
const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
return () => sub.subscription.unsubscribe();
}, [sb]);
useEffect(() => {
if (!session) return;
(async () => {
const uid = session.user.id;
const [{ data: prof }, { data: rr }, { data: sa }] = await Promise.all([
sb.from("profiles").select("full_name,email,role,student_id").eq("id", uid).maybeSingle(),
sb.from("exam_item_roles").select("role").eq("user_id", uid),
sb.rpc("auth_is_super_admin"),
]);
setProfile(prof || { email: session.user.email });
setRoles((rr || []).map((x) => x.role));
setSuperAdmin(!!sa);
// item-bank access gate — the shared auth base includes students, so entry requires approval or an invite
let inviteCode = null; try { inviteCode = new URL(window.location.href).searchParams.get("invite"); } catch {}
if (inviteCode) { try { await sb.rpc("exam_redeem_invite", { _code: inviteCode }); } catch {} try { const u = new URL(window.location.href); u.searchParams.delete("invite"); window.history.replaceState({}, "", u.pathname + u.search + u.hash); } catch {} }
const [{ data: acc }, { data: wa }] = await Promise.all([sb.rpc("exam_my_access"), sb.rpc("exam_writer_my")]);
setAccess(acc || { access: false });
setWriterApp(wa || null);
const [d, s, t, sp] = await Promise.all([
sb.from("nl_domains").select("*").order("sort_order"),
sb.from("nl_subitems").select("*").order("sort_order"),
sb.from("physician_tasks").select("*").order("sort_order"),
sb.from("medical_specialties").select("id,name_th,name_en,display_order").order("display_order"),
]);
setDomains(d.data || []); setSubitems(s.data || []);
setTasks(t.data || []); setSpecs(sp.data || []);
})();
}, [session, sb]);
// committee model — one person may hold several roles (committee = ทุกหน้าที่)
const canWrite = superAdmin || roles.includes("committee") || roles.includes("item_writer");   // กรรมการออกข้อสอบ
const isReviewer = superAdmin || roles.includes("committee") || roles.includes("reviewer");      // กรรมการคัดเลือก/วิพากษ์
const canSets = superAdmin || roles.includes("committee") || roles.includes("set_manager");      // กรรมการจัดทำชุด
const isAnalyst = superAdmin || roles.includes("committee") || roles.includes("analyst");        // กรรมการวิเคราะห์ผล
const isCenterStaff = superAdmin || roles.includes("center_staff");                              // นักวิชาการ/เจ้าหน้าที่ศูนย์
const showApply = !(superAdmin || canWrite || isReviewer || canSets || isAnalyst || isCenterStaff);
// จัดรอบการสอบ + ค่าตอบแทน = เจ้าหน้าที่ สพพ. (admin) เท่านั้น
// who may browse the SHARED item bank (matches the bank_items RLS read policy) — pure item_writer excluded
const canFullBank = superAdmin || roles.includes("committee") || roles.includes("reviewer") || roles.includes("set_manager") || roles.includes("analyst") || roles.includes("registrar");
const hasStaff = superAdmin || roles.length > 0;
if (session === undefined) return <div className="login"><div className="muted">กำลังโหลด…</div></div>;
if (!session) return <Login sb={sb} />;
const bp = { domains, subitems, tasks, specs };
const me = session.user.id;
if (profile === null || access === undefined) return <div className="login"><div className="muted">กำลังโหลด…</div></div>;
const reloadIdentity = async () => { const uid = session.user.id; const [{ data: rr }, { data: a }, { data: wa }] = await Promise.all([sb.from("exam_item_roles").select("role").eq("user_id", uid), sb.rpc("exam_my_access"), sb.rpc("exam_writer_my")]); setRoles((rr || []).map((x) => x.role)); setAccess(a || { access: false }); setWriterApp(wa || null); };
const refreshAccess = reloadIdentity;
const applied = !!(writerApp && writerApp.status);
if (!access.access) {
if (!hasStaff && applied) {
const allowed = ["home", "apply", "schedule", "take"];
return (
<>
<StaffShell tab={tab} onNavigate={setTab} profile={profile} roles={[]} superAdmin={false} canApprove={false} canWrite={false} canSets={false} canFullBank={false} preview onSignOut={() => sb.auth.signOut()}>
<div className="section">
<div className="preview-banner">⏳ บัญชีของคุณอยู่ระหว่างรอผู้ดูแล (สพพ.) พิจารณาแต่งตั้ง — ขณะนี้เข้าดูได้เฉพาะ “กำหนดการ” และ “ทำข้อสอบ (ตัวอย่าง)” · เมนูอื่นจะเปิดใช้งานเมื่อได้รับการแต่งตั้ง</div>
{tab === "home" && <HomeCards profile={profile} roles={[]} superAdmin={false} canWrite={false} onNavigate={setTab} only={["teacher"]} />}
{tab === "apply" && <WriterApplication sb={sb} profile={profile} notify={notify} onApplied={reloadIdentity} />}
{tab === "schedule" && <Schedule sb={sb} canWrite={false} notify={notify} />}
{tab === "take" && <><div className="preview-banner" style={{ background: "var(--accent-tint)", color: "var(--ink)" }}>🧪 โหมดตัวอย่าง — ทดลองการทำข้อสอบก่อนได้รับการแต่งตั้ง</div><DeliveryPortal sb={sb} profile={profile} onExit={() => setTab("home")} /></>}
{!allowed.includes(tab) && <div className="card"><p className="muted" style={{ margin: 0 }}>🔒 เมนูนี้จะเปิดใช้งานเมื่อได้รับการแต่งตั้งเป็นผู้ออกข้อสอบ</p></div>}
</div>
</StaffShell>
{toast && <div className="toast">{toast}</div>}
</>
);
}
return <AccessGate sb={sb} status={access.status} profile={profile} onSignOut={() => sb.auth.signOut()} onChanged={refreshAccess} />;
}
if (superAdmin && locked) return <LockScreen onUnlock={() => setLockedPersist(false)} />;
// Non-staff users (students) get the exam-taking portal
if (!hasStaff) {
return (
<>
<DeliveryPortal sb={sb} profile={profile} onSignOut={() => sb.auth.signOut()} />
{toast && <div className="toast">{toast}</div>}
</>
);
}
if (tab === "take") return <DeliveryPortal sb={sb} profile={profile} onExit={() => setTab("dashboard")} />;
return (
<>
<StaffShell tab={tab} onNavigate={setTab} profile={profile} roles={roles} superAdmin={superAdmin} isReviewer={isReviewer} isAnalyst={isAnalyst} isCenterStaff={isCenterStaff} showApply={showApply} canWrite={canWrite} canSets={canSets} canFullBank={canFullBank} onLock={superAdmin ? () => setLockedPersist(true) : null} onSignOut={() => sb.auth.signOut()}>
<div className="section">
{tab === "home" && <HomeCards profile={profile} roles={roles} superAdmin={superAdmin} canWrite={canWrite} onNavigate={setTab} only={superAdmin ? null : (canWrite || isReviewer || canSets || isAnalyst ? ["teacher"] : ["staff"])} />}
{tab === "apply" && <WriterApplication sb={sb} profile={profile} notify={notify} onApplied={reloadIdentity} />}
{tab === "students" && isCenterStaff && <CenterStudents sb={sb} notify={notify} />}
{tab === "dashboard" && canFullBank && <Dashboard sb={sb} bp={bp} notify={notify} onOpenBank={(status) => { setBankStatus(status); setTab("bank"); }} />}
{tab === "bank" && canFullBank && <Bank initialStatus={bankStatus} sb={sb} bp={bp} me={me} canWrite={canWrite} canApprove={isReviewer} notify={notify} />}
{tab === "meq" && canFullBank && <MeqBank sb={sb} bp={bp} me={me} canWrite={canWrite} canApprove={isReviewer} notify={notify} />}
{tab === "mybank" && canWrite && <MyBank sb={sb} bp={bp} me={me} canWrite={canWrite} notify={notify} />}
{canSets && <div hidden={tab !== "sets"}><ExamSets sb={sb} bp={bp} me={me} notify={notify} /></div>}
{tab === "assign" && superAdmin && <DeliveryManager sb={sb} />}
{tab === "theater" && isReviewer && <Theater sb={sb} bp={bp} me={me} notify={notify} />}
{tab === "scores" && isAnalyst && <ScoreAnalytics sb={sb} bp={bp} notify={notify} initialTab="people" />}
{tab === "analyze" && isAnalyst && <ScoreAnalytics sb={sb} bp={bp} notify={notify} initialTab="sets" />}
{tab === "cert" && isAnalyst && <Certificates sb={sb} notify={notify} />}
{tab === "comp" && superAdmin && <ItemCompensation sb={sb} notify={notify} />}
{tab === "schedule" && <Schedule sb={sb} canWrite={superAdmin} notify={notify} />}
{tab === "import" && canWrite && <Import sb={sb} bp={bp} me={me} notify={notify} />}
{tab === "accounts" && superAdmin && <AccountsAdmin sb={sb} me={me} notify={notify} />}
{tab === "roles" && superAdmin && <RolesAdmin sb={sb} me={me} notify={notify} />}
</div>
</StaffShell>
{toast && <div className="toast">{toast}</div>}
</>
);
}
function AccessGate({ sb, status, profile, onSignOut, onChanged }) {
const [busy, setBusy] = useState(false);
const [code, setCode] = useState("");
const [msg, setMsg] = useState("");
const [apply, setApply] = useState(false);
if (apply) return (
<div className="login"><div className="box" style={{ maxWidth: 780, width: "100%", textAlign: "left" }}>
<button className="btn ghost sm" onClick={() => { setApply(false); setMsg(""); onChanged(); }}>← กลับหน้าเข้าสู่ระบบ</button>
<div style={{ marginTop: 12 }}><WriterApplication sb={sb} profile={profile} notify={(m) => setMsg(m)} onApplied={onChanged} /></div>
{msg && <p className="delivery-sync" style={{ marginTop: 10 }}>{msg}</p>}
<p className="muted" style={{ marginTop: 12 }}>เมื่อส่งใบสมัครแล้ว ผู้ดูแล (สพพ.) จะพิจารณาแต่งตั้ง จากนั้นบัญชีของคุณจะเข้าใช้งานได้</p>
<button className="btn ghost sm" onClick={onSignOut} style={{ marginTop: 8 }}>ออกจากระบบ</button>
</div></div>
);
const request = async () => { setBusy(true); setMsg(""); const { error } = await sb.rpc("exam_request_access"); setBusy(false); if (error) return setMsg("เกิดข้อผิดพลาด: " + error.message); await onChanged(); };
const redeem = async () => { if (!code.trim()) return; setBusy(true); setMsg(""); const { data, error } = await sb.rpc("exam_redeem_invite", { _code: code.trim() }); setBusy(false); if (error) return setMsg(error.message); if (data && data.ok === false) return setMsg(data.error || "ลิงก์เชิญไม่ถูกต้อง"); await onChanged(); };
return (
<div className="login"><div className="box" style={{ maxWidth: 460 }}>
<img src="/cpird-logo.png" alt="CPIRD" style={{ height: 84, width: "auto", display: "block", margin: "0 auto 12px" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
<h2 style={{ color: "var(--accent)", marginBottom: 8 }}>ระบบจัดทดสอบและวัดผล สพพ.</h2>
{status === "pending" ? <>
<p className="muted">บัญชี <b>{profile?.email}</b> ได้ส่งคำขอเข้าใช้งานแล้ว กรุณารอผู้ดูแลระบบอนุมัติ แล้วเข้าสู่ระบบอีกครั้ง</p>
<button className="btn" disabled={busy} onClick={() => setApply(true)} style={{ marginTop: 14, width: "100%" }}>✍️ กรอก/แก้ไขใบสมัครผู้ออกข้อสอบ</button>
<button className="btn ghost" disabled={busy} onClick={onChanged} style={{ marginTop: 8 }}>ตรวจสอบสถานะอีกครั้ง</button>
</> : status === "revoked" ? <>
<p className="delivery-alert" style={{ marginTop: 10 }}>บัญชีนี้ถูกระงับการเข้าใช้งานระบบคลังข้อสอบ โปรดติดต่อผู้ดูแลระบบ</p>
</> : <>
<p className="muted">ระบบคลังข้อสอบจำกัดเฉพาะผู้ได้รับอนุญาต (บัญชี <b>{profile?.email}</b>)</p>
<button className="apply-hero" disabled={busy} onClick={() => setApply(true)}>
<span className="apply-hero-ico" aria-hidden="true">✍️</span>
<span className="apply-hero-txt"><b>สมัครเป็นผู้ออกข้อสอบ</b><span>สำหรับอาจารย์แพทย์ — ส่งใบสมัครให้ สพพ. พิจารณาแต่งตั้งเป็นคณะกรรมการออกข้อสอบ</span></span>
<span className="apply-hero-arrow" aria-hidden="true">→</span>
</button>
<div style={{ margin: "16px 0 8px", textAlign: "center" }} className="muted">— หรือ สำหรับเจ้าหน้าที่ / นักศึกษา —</div>
<button className="btn ghost sm" disabled={busy} onClick={request} style={{ width: "100%" }}>ขอเข้าใช้งานทั่วไป (รออนุมัติ)</button>
<div className="row" style={{ gap: 6, marginTop: 8 }}><input placeholder="รหัสเชิญ หรือวางลิงก์เชิญ" value={code} onChange={(e) => { const v = e.target.value; setCode(v.includes("invite=") ? v.split("invite=")[1].split(/[&#]/)[0] : v); }} /><button className="btn ghost sm" disabled={busy || !code.trim()} onClick={redeem}>ใช้รหัส</button></div>
</>}
{msg && <p className="delivery-alert" style={{ marginTop: 10 }}>{msg}</p>}
<button className="btn ghost sm" onClick={onSignOut} style={{ marginTop: 18 }}>ออกจากระบบ</button>
</div></div>
);
}
function LockScreen({ onUnlock }) {
return (
<div className="lockscreen">
<img src="/lock-cover.png" alt="" className="lock-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
<div className="lock-box">
<div className="lock-emoji" aria-hidden="true">🔒</div>
<h2 style={{ color: "var(--accent)", margin: "0 0 6px" }}>หน้าจอถูกล็อก</h2>
<p className="muted" style={{ marginBottom: 20 }}>ระบบคลังข้อสอบถูกล็อกเพื่อความปลอดภัย ป้องกันผู้อื่นเข้าถึงคลังข้อสอบและชุดข้อสอบ</p>
<button className="btn" onClick={onUnlock}>ปลดล็อกเพื่อเข้าใช้งาน</button>
</div>
</div>
);
}
function Login({ sb }) {
const go = () => sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
return (
<div className="login"><div className="box">
<img src="/cpird-logo.png" alt="CPIRD" style={{ height: 96, width: "auto", display: "block", margin: "0 auto 14px" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
<h2 style={{ color: "var(--accent)", marginBottom: 6 }}>ระบบจัดทดสอบและวัดผล สพพ.</h2>
<p className="muted" style={{ marginBottom: 22 }}>ระบบจัดการคลังข้อสอบ MCQ/MEQ · เข้าสู่ระบบด้วยบัญชีเดียวกับ LMS</p>
<button className="gbtn" onClick={go}>เข้าสู่ระบบด้วย Google</button>
</div></div>
);
}
