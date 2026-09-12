"use client";
import { useEffect, useState, useCallback } from "react";
import { getSupabase } from "../lib/supabaseClient";
import Dashboard from "./Dashboard";
import Bank from "./Bank";
import MeqBank from "./MeqBank";
import Theater from "./Theater";
import ExamSets from "./ExamSets";
import Import from "./Import";
import RolesAdmin from "./RolesAdmin";
import DeliveryPortal from "./DeliveryPortal";
import DeliveryManager from "./DeliveryManager";
export default function Page() {
const sb = getSupabase();
const [session, setSession] = useState(undefined);
const [profile, setProfile] = useState(null);
const [roles, setRoles] = useState([]);
const [superAdmin, setSuperAdmin] = useState(false);
const [tab, setTab] = useState("dashboard");
const [bankStatus, setBankStatus] = useState("");
const [toast, setToast] = useState("");
const [domains, setDomains] = useState([]);
const [subitems, setSubitems] = useState([]);
const [tasks, setTasks] = useState([]);
const [specs, setSpecs] = useState([]);
const notify = useCallback((m) => { setToast(m); setTimeout(() => setToast(""), 3200); }, []);
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
const [d, s, t, sp] = await Promise.all([
sb.from("nl_domains").select("*").order("sort_order"),
sb.from("nl_subitems").select("*").order("sort_order"),
sb.from("physician_tasks").select("*").order("sort_order"),
sb.from("medical_specialties").select("id,name_th,display_order").order("display_order"),
]);
setDomains(d.data || []); setSubitems(s.data || []);
setTasks(t.data || []); setSpecs(sp.data || []);
})();
}, [session, sb]);
const canWrite = superAdmin || roles.includes("committee") || roles.includes("item_writer");
const canApprove = superAdmin || roles.includes("committee");
const hasStaff = superAdmin || roles.length > 0;
if (session === undefined) return <div className="login"><div className="muted">กำลังโหลด…</div></div>;
if (!session) return <Login sb={sb} />;
const bp = { domains, subitems, tasks, specs };
const me = session.user.id;
if (profile === null) return <div className="login"><div className="muted">กำลังโหลด…</div></div>;
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
<div className="topbar"><div className="wrap in">
<span className="brand">คลังข้อสอบ CPIRD</span>
<div className="tabs">
<button className="tab" onClick={() => setTab("take")}>โหมดทำข้อสอบ</button>
<button className={"tab" + (tab === "dashboard" ? " active" : "")} onClick={() => setTab("dashboard")}>แดชบอร์ด</button>
<button className={"tab" + (tab === "bank" ? " active" : "")} onClick={() => setTab("bank")}>คลัง MCQ</button>
<button className={"tab" + (tab === "meq" ? " active" : "")} onClick={() => setTab("meq")}>คลัง MEQ</button>
{canApprove && <button className={"tab" + (tab === "sets" ? " active" : "")} onClick={() => setTab("sets")}>สร้างชุดข้อสอบ</button>}
{canApprove && <button className={"tab" + (tab === "assign" ? " active" : "")} onClick={() => setTab("assign")}>มอบหมายสอบ</button>}
{canApprove && <button className={"tab" + (tab === "theater" ? " active" : "")} onClick={() => setTab("theater")}>วิพากษ์ข้อสอบ</button>}
{canWrite && <button className={"tab" + (tab === "import" ? " active" : "")} onClick={() => setTab("import")}>นำเข้า Excel</button>}
{superAdmin && <button className={"tab" + (tab === "roles" ? " active" : "")} onClick={() => setTab("roles")}>จัดการสิทธิ์</button>}
</div>
<span className="grow" />
<span className="who">
{profile?.full_name || profile?.email}<br />
<span className="muted">{superAdmin ? "admin" : roles.join(", ") || "ผู้ใช้"}</span>
</span>
<button className="btn ghost sm" onClick={() => sb.auth.signOut()}>ออก</button>
</div></div>
<div className="wrap section">
{tab === "dashboard" && <Dashboard sb={sb} bp={bp} notify={notify} onOpenBank={(status) => { setBankStatus(status); setTab("bank"); }} />}
{tab === "bank" && <Bank initialStatus={bankStatus} sb={sb} bp={bp} me={me} canWrite={canWrite} canApprove={canApprove} notify={notify} />}
{tab === "meq" && <MeqBank sb={sb} bp={bp} me={me} canWrite={canWrite} canApprove={canApprove} notify={notify} />}
{tab === "sets" && canApprove && <ExamSets sb={sb} bp={bp} me={me} notify={notify} />}
{tab === "assign" && canApprove && <DeliveryManager sb={sb} />}
{tab === "theater" && canApprove && <Theater sb={sb} bp={bp} me={me} notify={notify} />}
{tab === "import" && canWrite && <Import sb={sb} bp={bp} me={me} notify={notify} />}
{tab === "roles" && superAdmin && <RolesAdmin sb={sb} me={me} notify={notify} />}
</div>
{toast && <div className="toast">{toast}</div>}
</>
);
}
function Login({ sb }) {
const go = () => sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
return (
<div className="login"><div className="box">
<h2 style={{ color: "var(--accent)", marginBottom: 6 }}>คลังข้อสอบ CPIRD</h2>
<p className="muted" style={{ marginBottom: 22 }}>ระบบจัดการคลังข้อสอบ MCQ/MEQ · เข้าสู่ระบบด้วยบัญชีเดียวกับ LMS</p>
<button className="gbtn" onClick={go}>เข้าสู่ระบบด้วย Google</button>
</div></div>
);
}
