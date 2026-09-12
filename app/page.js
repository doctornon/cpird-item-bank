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
const [locked, setLocked] = useState(false);
const [tab, setTab] = useState("dashboard");
const [bankStatus, setBankStatus] = useState("");
const [toast, setToast] = useState("");
const [domains, setDomains] = useState([]);
const [subitems, setSubitems] = useState([]);
const [tasks, setTasks] = useState([]);
const [specs, setSpecs] = useState([]);
const notify = useCallback((m) => { setToast(m); setTimeout(() => setToast(""), 3200); }, []);
useEffect(() => { try { setLocked(localStorage.getItem("cpird_locked") === "1"); } catch {} }, []);
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
const canWrite = superAdmin || roles.includes("committee") || roles.includes("item_writer");
const canApprove = superAdmin || roles.includes("committee");
const hasStaff = superAdmin || roles.length > 0;
if (session === undefined) return <div className="login"><div className="muted">กำลังโหลด…</div></div>;
if (!session) return <Login sb={sb} />;
const bp = { domains, subitems, tasks, specs };
const me = session.user.id;
if (profile === null) return <div className="login"><div className="muted">กำลังโหลด…</div></div>;
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
<StaffShell tab={tab} onNavigate={setTab} profile={profile} roles={roles} superAdmin={superAdmin} canApprove={canApprove} canWrite={canWrite} onLock={superAdmin ? () => setLockedPersist(true) : null} onSignOut={() => sb.auth.signOut()}>
<div className="section">
{tab === "dashboard" && <Dashboard sb={sb} bp={bp} notify={notify} onOpenBank={(status) => { setBankStatus(status); setTab("bank"); }} />}
{tab === "bank" && <Bank initialStatus={bankStatus} sb={sb} bp={bp} me={me} canWrite={canWrite} canApprove={canApprove} notify={notify} />}
{tab === "meq" && <MeqBank sb={sb} bp={bp} me={me} canWrite={canWrite} canApprove={canApprove} notify={notify} />}
{tab === "mybank" && canWrite && <MyBank sb={sb} bp={bp} me={me} canWrite={canWrite} notify={notify} />}
{canApprove && <div hidden={tab !== "sets"}><ExamSets sb={sb} bp={bp} me={me} notify={notify} /></div>}
{tab === "assign" && canApprove && <DeliveryManager sb={sb} />}
{tab === "theater" && canApprove && <Theater sb={sb} bp={bp} me={me} notify={notify} />}
{tab === "scores" && canApprove && <ScoreAnalytics sb={sb} notify={notify} />}
{tab === "import" && canWrite && <Import sb={sb} bp={bp} me={me} notify={notify} />}
{tab === "roles" && superAdmin && <RolesAdmin sb={sb} me={me} notify={notify} />}
</div>
</StaffShell>
{toast && <div className="toast">{toast}</div>}
</>
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
<h2 style={{ color: "var(--accent)", marginBottom: 6 }}>คลังข้อสอบ CPIRD</h2>
<p className="muted" style={{ marginBottom: 22 }}>ระบบจัดการคลังข้อสอบ MCQ/MEQ · เข้าสู่ระบบด้วยบัญชีเดียวกับ LMS</p>
<button className="gbtn" onClick={go}>เข้าสู่ระบบด้วย Google</button>
</div></div>
);
}
