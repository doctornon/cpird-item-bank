"use client";
import { useEffect, useState, useCallback } from "react";
const ROLES = ["item_writer", "committee", "set_manager", "registrar"];
const ROLE_TH = {
item_writer: "ผู้ออกข้อสอบ",
committee: "กรรมการ (วิพากษ์/อนุมัติ/ชุดข้อสอบ)",
set_manager: "จัดชุดข้อสอบ (สร้างชุด/คัดเลือกข้อ)",
registrar: "ทะเบียน (ดูชุดข้อสอบ)",
};
export default function RolesAdmin({ sb, me, notify }) {
const [holders, setHolders] = useState([]);
const [names, setNames] = useState({});
const [q, setQ] = useState("");
const [results, setResults] = useState([]);
const [searched, setSearched] = useState(false);
const [busy, setBusy] = useState(false);
const loadHolders = useCallback(async () => {
const { data } = await sb.from("exam_item_roles").select("*");
const list = data || []; setHolders(list);
const ids = [...new Set(list.map((r) => r.user_id))];
if (ids.length) {
const { data: ns } = await sb.rpc("profile_names", { _ids: ids });
const m = {}; (ns || []).forEach((n) => { m[n.id] = n.full_name || n.email; }); setNames(m);
}
}, [sb]);
useEffect(() => { loadHolders(); }, [loadHolders]);
const search = async () => {
const { data, error } = await sb.rpc("search_profiles", { _q: q });
setSearched(true);
if (error) return notify("ผิดพลาด: " + error.message);
setResults(data || []);
};
const rolesOf = (uid) => holders.filter((h) => h.user_id === uid).map((h) => h.role);
const toggle = async (uid, role, has) => {
setBusy(true);
let error;
if (has) ({ error } = await sb.from("exam_item_roles").delete().eq("user_id", uid).eq("role", role));
else ({ error } = await sb.from("exam_item_roles").insert({ user_id: uid, role, granted_by: me }));
setBusy(false);
if (error) return notify("ผิดพลาด: " + error.message);
notify("อัปเดตสิทธิ์แล้ว"); loadHolders();
};
const byUser = {};
holders.forEach((h) => { (byUser[h.user_id] = byUser[h.user_id] || []).push(h.role); });
return (
<div className="grid2" style={{ alignItems: "start" }}>
<div className="card">
<h3 style={{ marginBottom: 8 }}>ค้นหาผู้ใช้เพื่อกำหนดสิทธิ์</h3>
<div className="row" style={{ gap: 6 }}>
<input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="อีเมล / ชื่อ / รหัสนักศึกษา" />
<button className="btn" onClick={search}>ค้นหา</button>
</div>
<div className="tablewrap" style={{ marginTop: 12 }}>
<table>
<thead><tr><th>ผู้ใช้</th>{ROLES.map((r) => <th key={r} style={{ textAlign: "center" }}>{ROLE_TH[r].split(" ")[0]}</th>)}</tr></thead>
<tbody>
{searched && results.length === 0 && <tr><td colSpan={ROLES.length + 1}><div className="empty">ไม่พบผู้ใช้</div></td></tr>}
{results.map((u) => {
const rs = rolesOf(u.id);
return (
<tr key={u.id}>
<td>{u.full_name || u.email}<br /><span className="muted">{u.email}</span></td>
{ROLES.map((role) => {
const has = rs.includes(role);
return <td key={role} style={{ textAlign: "center" }}>
<input type="checkbox" style={{ width: "auto" }} checked={has} disabled={busy} onChange={() => toggle(u.id, role, has)} />
</td>;
})}
</tr>
);
})}
</tbody>
</table>
</div>
<div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
{ROLES.map((r) => <div key={r}>• <b>{ROLE_TH[r].split(" ")[0]}</b> = {ROLE_TH[r]}</div>)}
</div>
</div>
<div className="card">
<h3 style={{ marginBottom: 8 }}>ผู้มีสิทธิ์ปัจจุบัน ({Object.keys(byUser).length} คน)</h3>
<div className="tablewrap">
<table>
<thead><tr><th>ผู้ใช้</th><th>สิทธิ์</th></tr></thead>
<tbody>
{Object.keys(byUser).length === 0 && <tr><td colSpan={2}><div className="empty">ยังไม่มีผู้ได้รับสิทธิ์</div></td></tr>}
{Object.entries(byUser).map(([uid, rs]) => (
<tr key={uid}>
<td>{names[uid] || uid.slice(0, 8)}{uid === me ? " (คุณ)" : ""}</td>
<td>{rs.map((r) => <span key={r} className="pill approved" style={{ marginRight: 4 }}>{ROLE_TH[r].split(" ")[0]}</span>)}</td>
</tr>
))}
</tbody>
</table>
</div>
<p className="muted" style={{ marginTop: 10, fontSize: 12 }}>หมายเหตุ: ผู้ดูแลระบบ (super admin ของ LMS) มีสิทธิ์ทุกอย่างอยู่แล้ว ไม่ต้องกำหนดที่นี่</p>
</div>
</div>
);
}
