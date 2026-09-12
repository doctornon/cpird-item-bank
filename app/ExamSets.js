"use client";
import { useEffect, useState, useCallback } from "react";
const SET_STATUS_TH = { draft: "ร่าง", ready: "พร้อมใช้", archived: "เก็บ" };
export default function ExamSets({ sb, bp, me, notify }) {
const [sets, setSets] = useState([]);
const [sel, setSel] = useState(null);
const [setItems, setSetItems] = useState([]);
const [meta, setMeta] = useState({});
const [newName, setNewName] = useState("");
const [newDesc, setNewDesc] = useState("");
const [picker, setPicker] = useState(false);
const [pool, setPool] = useState([]);
const [poolStems, setPoolStems] = useState({});
const [pf, setPf] = useState({ q: "", domain: "", spec: "", type: "" });
const loadSets = useCallback(async () => {
const { data } = await sb.from("exam_sets").select("*").order("updated_at", { ascending: false });
setSets(data || []);
}, [sb]);
useEffect(() => { loadSets(); }, [loadSets]);
const loadItems = useCallback(async (setId) => {
const { data } = await sb.from("exam_set_items").select("*").eq("exam_set_id", setId).order("position");
const list = data || []; setSetItems(list);
const ids = list.map((x) => x.item_id);
if (ids.length) {
const { data: its } = await sb.from("bank_items").select("id,current_version_id,type,nl_domain_code,nl_subitem").in("id", ids);
const vids = (its || []).map((x) => x.current_version_id).filter(Boolean);
const vmap = {};
if (vids.length) { const { data: vs } = await sb.from("bank_item_versions").select("id,stem").in("id", vids); (vs || []).forEach((v) => { vmap[v.id] = v.stem; }); }
const m = {}; (its || []).forEach((it) => { m[it.id] = { stem: vmap[it.current_version_id] || "", type: it.type, dom: it.nl_domain_code, sub: it.nl_subitem }; });
setMeta(m);
} else setMeta({});
}, [sb]);
const openSet = async (s) => { setSel(s); await loadItems(s.id); };
const createSet = async () => {
if (!newName.trim()) return notify("กรุณาตั้งชื่อชุดข้อสอบ");
const { data, error } = await sb.from("exam_sets").insert({ name: newName, description: newDesc || null, created_by: me }).select("*").single();
if (error) return notify("ผิดพลาด: " + error.message);
setNewName(""); setNewDesc(""); await loadSets(); notify("สร้างชุดแล้ว"); openSet(data);
};
const setStatus = async (st) => {
if (!sel) return;
const { error } = await sb.from("exam_sets").update({ status: st, updated_at: new Date().toISOString() }).eq("id", sel.id);
if (error) return notify("ผิดพลาด: " + error.message);
setSel({ ...sel, status: st }); loadSets(); notify("อัปเดตสถานะ");
};
const loadPool = useCallback(async () => {
let q = sb.from("bank_items").select("id,current_version_id,type,nl_domain_code,nl_subitem,specialty_id,use_count,status").eq("status", "approved").order("updated_at", { ascending: false }).limit(500);
if (pf.domain) q = q.eq("nl_domain_code", pf.domain);
if (pf.spec) q = q.eq("specialty_id", Number(pf.spec));
if (pf.type) q = q.eq("type", pf.type);
const { data } = await q; const list = data || []; setPool(list);
const vids = list.map((x) => x.current_version_id).filter(Boolean);
if (vids.length) { const { data: vs } = await sb.from("bank_item_versions").select("id,stem").in("id", vids); const m = {}; (vs || []).forEach((v) => { m[v.id] = v.stem; }); setPoolStems(m); }
}, [sb, pf]);
useEffect(() => { if (picker) loadPool(); }, [picker, loadPool]);
const inSet = (id) => setItems.some((x) => x.item_id === id);
const addItem = async (it) => {
if (inSet(it.id)) return;
const pos = setItems.length ? Math.max(...setItems.map((x) => x.position)) + 1 : 1;
const { error } = await sb.from("exam_set_items").insert({ exam_set_id: sel.id, item_id: it.id, position: pos, points: 1 });
if (error) return notify("ผิดพลาด: " + error.message);
loadItems(sel.id);
};
const removeItem = async (row) => {
const { error } = await sb.from("exam_set_items").delete().eq("id", row.id);
if (error) return notify("ผิดพลาด: " + error.message);
loadItems(sel.id);
};
const move = async (i, dir) => {
const j = i + dir; if (j < 0 || j >= setItems.length) return;
const a = setItems[i], b = setItems[j];
await sb.from("exam_set_items").update({ position: b.position }).eq("id", a.id);
await sb.from("exam_set_items").update({ position: a.position }).eq("id", b.id);
loadItems(sel.id);
};
const setPoints = async (row, val) => {
const p = Number(val); if (isNaN(p)) return;
await sb.from("exam_set_items").update({ points: p }).eq("id", row.id);
setSetItems(setItems.map((x) => x.id === row.id ? { ...x, points: p } : x));
};
const specName = (id) => bp.specs.find((s) => s.id === id)?.name_th || "";
const totalPoints = setItems.reduce((s, x) => s + Number(x.points || 0), 0);
const poolFiltered = pool.filter((it) => {
if (!pf.q) return true;
const hay = ((poolStems[it.current_version_id] || "") + " " + (it.nl_subitem || "")).toLowerCase();
return hay.includes(pf.q.toLowerCase());
});
return (
<div className="theater">
<div className="th-side">
<div className="card" style={{ padding: 14, marginBottom: 12 }}>
<label>ชื่อชุดข้อสอบใหม่</label>
<input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="เช่น สอบ NL รอบเช้า 2568" />
<input style={{ marginTop: 6 }} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="คำอธิบาย (ถ้ามี)" />
<button className="btn" style={{ marginTop: 8, width: "100%" }} onClick={createSet}>+ สร้างชุด</button>
</div>
<div className="muted" style={{ marginBottom: 6 }}>ชุดข้อสอบ ({sets.length})</div>
<div className="th-list">
{sets.map((s) => (
<button key={s.id} className={"th-li" + (sel?.id === s.id ? " active" : "")} onClick={() => openSet(s)}>
<span className="th-txt" style={{ flex: 1 }}>{s.name}</span>
<span className={"pill " + (s.status === "ready" ? "approved" : s.status === "archived" ? "retired" : "draft")}>{SET_STATUS_TH[s.status] || s.status}</span>
</button>
))}
{sets.length === 0 && <div className="muted">ยังไม่มีชุดข้อสอบ</div>}
</div>
</div>
<div className="th-stage">
{!sel ? <div className="empty">เลือกหรือสร้างชุดข้อสอบทางซ้าย</div> : (
<>
<div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
<h3>{sel.name}</h3>
<div className="row" style={{ gap: 6, alignItems: "center" }}>
<select value={sel.status} onChange={(e) => setStatus(e.target.value)} style={{ width: "auto" }}>
<option value="draft">ร่าง</option><option value="ready">พร้อมใช้</option><option value="archived">เก็บ</option>
</select>
<button className="btn sm" onClick={() => setPicker(true)}>+ เพิ่มข้อจากคลัง</button>
</div>
</div>
{sel.description && <div className="muted" style={{ marginBottom: 10 }}>{sel.description}</div>}
<div className="stat" style={{ marginBottom: 12 }}>
<div className="s"><div className="n">{setItems.length}</div><div className="k">จำนวนข้อ</div></div>
<div className="s"><div className="n">{totalPoints}</div><div className="k">คะแนนรวม</div></div>
</div>
<div className="tablewrap">
<table>
<thead><tr><th>#</th><th>เลขข้อ</th><th>ชนิด</th><th>โจทย์</th><th>หมวด</th><th>คะแนน</th><th>ลำดับ</th><th></th></tr></thead>
<tbody>
{setItems.length === 0 && <tr><td colSpan={8}><div className="empty">ยังไม่มีข้อในชุดนี้</div></td></tr>}
{setItems.map((row, i) => {
const m = meta[row.item_id] || {};
return (
<tr key={row.id}>
<td>{i + 1}</td>
<td style={{ fontWeight: 700, color: "var(--accent)", whiteSpace: "nowrap" }}>#{row.item_id}</td>
<td><span className={"pill " + (m.type || "mcq")}>{(m.type || "").toUpperCase()}</span></td>
<td style={{ maxWidth: 320 }}>{(m.stem || "—").slice(0, 90)}</td>
<td>{m.dom || "—"}{m.sub ? " → " + m.sub : ""}</td>
<td><input type="number" step="0.5" value={row.points} onChange={(e) => setPoints(row, e.target.value)} style={{ width: 70 }} /></td>
<td><div className="row" style={{ gap: 2 }}>
<button className="btn ghost sm" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
<button className="btn ghost sm" disabled={i >= setItems.length - 1} onClick={() => move(i, 1)}>↓</button>
</div></td>
<td><button className="btn ghost sm" onClick={() => removeItem(row)}>ลบ</button></td>
</tr>
);
})}
</tbody>
</table>
</div>
</>
)}
</div>
{picker && (
<div className="overlay" onClick={(e) => e.target === e.currentTarget && setPicker(false)}>
<div className="modal" style={{ maxWidth: 820 }}>
<div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
<h3>เพิ่มข้อจากคลัง (เฉพาะข้อที่อนุมัติแล้ว)</h3>
<button className="btn ghost sm" onClick={() => setPicker(false)}>ปิด</button>
</div>
<div className="filters">
<div className="f"><label>ค้นหา</label><input value={pf.q} onChange={(e) => setPf({ ...pf, q: e.target.value })} placeholder="โจทย์ / หัวข้อย่อย" /></div>
<div className="f"><label>หมวด</label><select value={pf.domain} onChange={(e) => setPf({ ...pf, domain: e.target.value })}><option value="">ทั้งหมด</option>{bp.domains.map((d) => <option key={d.code} value={d.code}>{d.code}</option>)}</select></div>
<div className="f"><label>สาขา</label><select value={pf.spec} onChange={(e) => setPf({ ...pf, spec: e.target.value })}><option value="">ทั้งหมด</option>{bp.specs.map((s) => <option key={s.id} value={String(s.id)}>{s.name_th}</option>)}</select></div>
<div className="f"><label>ชนิด</label><select value={pf.type} onChange={(e) => setPf({ ...pf, type: e.target.value })}><option value="">ทั้งหมด</option><option value="mcq">MCQ</option><option value="meq">MEQ</option></select></div>
</div>
<div className="tablewrap" style={{ maxHeight: "55vh", overflow: "auto" }}>
<table>
<thead><tr><th>เลขข้อ</th><th>ชนิด</th><th>โจทย์</th><th>หมวด</th><th>สาขา</th><th></th></tr></thead>
<tbody>
{poolFiltered.length === 0 && <tr><td colSpan={6}><div className="empty">ไม่พบข้อสอบที่อนุมัติในเงื่อนไขนี้</div></td></tr>}
{poolFiltered.map((it) => (
<tr key={it.id}>
<td style={{ fontWeight: 700, color: "var(--accent)", whiteSpace: "nowrap" }}>#{it.id}</td>
<td><span className={"pill " + it.type}>{it.type.toUpperCase()}</span></td>
<td style={{ maxWidth: 340 }}>{(poolStems[it.current_version_id] || "—").slice(0, 90)}</td>
<td>{it.nl_domain_code || "—"}{it.nl_subitem ? " → " + it.nl_subitem : ""}</td>
<td>{specName(it.specialty_id)}</td>
<td>{inSet(it.id) ? <span className="muted">เพิ่มแล้ว</span> : <button className="btn sm" onClick={() => addItem(it)}>เพิ่ม</button>}</td>
</tr>
))}
</tbody>
</table>
</div>
</div>
</div>
)}
</div>
);
}
