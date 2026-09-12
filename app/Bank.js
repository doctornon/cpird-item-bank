"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { STATUS, STATUS_TH } from "../lib/constants";
import { ICD_SYSTEMS } from "../lib/tos.mjs";
import ItemEditor from "./ItemEditor";
import ItemPreview from "./ItemPreview";
const ICD_ROMAN = Object.fromEntries(ICD_SYSTEMS.map((s) => [s.code, s.roman]));
const ICD_TH = Object.fromEntries(ICD_SYSTEMS.map((s) => [s.code, s.roman + ". " + s.th]));
export default function Bank({ sb, bp, me, canWrite, canApprove, notify, initialStatus = "", previewOnly = false, bankType = "mcq" }) {
const [items, setItems] = useState([]);
const [stems, setStems] = useState({});
const [authors, setAuthors] = useState({});
const [loading, setLoading] = useState(true);
const [f, setF] = useState({ q: "", domain: [], task: [], spec: [], icd: [], status: initialStatus, type: bankType, year: [] });
const [advanced, setAdvanced] = useState(false);
const [openDrop, setOpenDrop] = useState(null);
const [loadError, setLoadError] = useState(false);
const [editing, setEditing] = useState(null);
const [previewing, setPreviewing] = useState(null);
const [sort, setSort] = useState({ key: "id", dir: "asc" });
const load = useCallback(async () => {
setLoading(true);
setLoadError(false);
const { data, error } = await sb.from("bank_items").select("*").eq("type", bankType).neq("status", "personal").order("updated_at", { ascending: false }).limit(500);
if (error) { setLoadError(true); setLoading(false); return; }
const list = data || [];
setItems(list);
const vids = list.map((x) => x.current_version_id).filter(Boolean);
if (vids.length) {
const { data: vs } = await sb.from("bank_item_versions").select("id,stem").in("id", vids);
const m = {}; (vs || []).forEach((v) => { m[v.id] = v.stem; }); setStems(m);
}
const aids = [...new Set(list.map((x) => x.author_id).filter(Boolean))];
if (aids.length) {
const { data: ns } = await sb.rpc("profile_names", { _ids: aids });
const am = {}; (ns || []).forEach((n) => { am[n.id] = n.full_name || n.email; }); setAuthors(am);
}
setLoading(false);
}, [sb, bankType]);
useEffect(() => { load(); }, [load]);
const specName = (id) => bp.specs.find((s) => s.id === id)?.name_th || "";
const taskName = (c) => bp.tasks.find((t) => t.code === c)?.name || c || "";
const domainTitle = (c) => bp.domains.find((d) => d.code === c)?.title || c || "";
const years = [...new Set(items.map((i) => i.exam_year).filter(Boolean))].sort((a, b) => b - a);
const toggleMulti = (key, value) => setF((prev) => {
const cur = prev[key] || [];
return { ...prev, [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] };
});
const advCount = f.domain.length + f.task.length + f.spec.length + f.icd.length + f.year.length;
const filtered = items.filter((it) => {
if (f.domain.length && !f.domain.includes(it.nl_domain_code)) return false;
if (f.task.length && !f.task.includes(it.physician_task)) return false;
if (f.spec.length && !f.spec.includes(String(it.specialty_id))) return false;
if (f.icd.length && !f.icd.includes(String(it.icd_system))) return false;
if (f.status && it.status !== f.status) return false;
if (f.type && it.type !== f.type) return false;
if (f.year.length && !f.year.includes(String(it.exam_year))) return false;
if (f.q) {
const hay = ((stems[it.current_version_id] || "") + " " + (it.nl_subitem || "")).toLowerCase();
if (!hay.includes(f.q.toLowerCase())) return false;
}
return true;
});
const sortVal = (it, key) => {
if (key === "id") return it.id;
if (key === "stem") return (stems[it.current_version_id] || "").toLowerCase();
if (key === "cat") return domainTitle(it.nl_domain_code).toLowerCase();
if (key === "sub") return (it.nl_subitem || "").toLowerCase();
if (key === "task") return taskName(it.physician_task).toLowerCase();
if (key === "spec") return specName(it.specialty_id).toLowerCase();
if (key === "icd") return it.icd_system ?? 999;
if (key === "author") return (authors[it.author_id] || "").toLowerCase();
if (key === "status") return STATUS.indexOf(it.status);
return "";
};
const sorted = useMemo(() => {
const arr = [...filtered];
arr.sort((a, b) => {
const va = sortVal(a, sort.key), vb = sortVal(b, sort.key);
let c = va < vb ? -1 : va > vb ? 1 : 0;
if (c === 0) c = a.id - b.id;
return sort.dir === "asc" ? c : -c;
});
return arr;
}, [filtered, sort, stems, authors]);
const toggleSort = (key) => setSort((prev) => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
const arrow = (key) => sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "";
const aria = (key) => sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none";
const counts = useMemo(() => {
const c = { total: items.length };
STATUS.forEach((s) => (c[s] = items.filter((i) => i.status === s).length));
return c;
}, [items]);
const hasFilter = f.q || f.status || advCount > 0;
return (
<>
<div className="workspace-heading">
<div><h2>คลังข้อสอบ {bankType.toUpperCase()}</h2><p>ค้นหา ทบทวน และจัดเตรียมข้อสอบสำหรับการสอบครั้งต่อไป</p></div>
{canWrite && <button className="btn" onClick={() => setEditing("new")}>สร้างข้อสอบ</button>}
</div>
<div className="bank-status" aria-label="กรองตามสถานะ">
{[["", "ทั้งหมด", counts.total], ["review", "รอทบทวน", counts.review], ["draft", "ร่าง", counts.draft], ["approved", "พร้อมใช้", counts.approved], ["retired", "ปลดแล้ว", counts.retired]].map(([value, label, count]) => <button key={value} className={"status-filter" + (f.status === value ? " selected" : "")} aria-pressed={f.status === value} onClick={() => setF({ ...f, status: value })}>{label} <span>{loading ? "—" : count}</span></button>)}
</div>
<div className="bank-search">
<div className="search-field"><label htmlFor="bank-search">ค้นหาข้อสอบ</label><input id="bank-search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="ค้นหาจากโจทย์หรือหัวข้อย่อย" /></div>
<div hidden><label htmlFor="bank-type">ชนิดข้อสอบ</label><select id="bank-type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">ทุกชนิด</option><option value="mcq">MCQ</option><option value="meq">MEQ</option></select></div>
<button className="btn ghost" aria-expanded={advanced} aria-controls="bank-advanced" onClick={() => setAdvanced(!advanced)}>ตัวกรองเพิ่มเติม{advCount ? ` (${advCount})` : ""}</button>
</div>
{advanced && <div id="bank-advanced" className="bank-advanced">
{[["domain", "หมวด", bp.domains.map(d => [d.code, d.title])], ["task", "ภารกิจ", bp.tasks.map(t => [t.code, t.name])], ["spec", "สาขา", bp.specs.map(x => [String(x.id), x.name_th])], ["icd", "ระบบโรค (ICD)", ICD_SYSTEMS.map(s => [String(s.code), s.roman + ". " + s.th])], ["year", "ปี พ.ศ.", years.map(y => [String(y), String(y)])]].map(([key, label, options]) => {
const sel = f[key];
const summary = sel.length === 0 ? "ทั้งหมด" : sel.length === 1 ? (options.find(([v]) => v === sel[0])?.[1] || "1 รายการ") : `เลือกแล้ว ${sel.length} รายการ`;
return <div key={key} className="bank-drop">
<label>{label}</label>
<button type="button" className={"bank-drop-toggle" + (sel.length ? " has-sel" : "")} aria-haspopup="listbox" aria-expanded={openDrop === key} onClick={() => setOpenDrop(openDrop === key ? null : key)}><span className="bank-drop-text">{summary}</span><span className="bank-drop-caret" aria-hidden="true">▾</span></button>
{openDrop === key && <>
<div className="bank-drop-backdrop" onClick={() => setOpenDrop(null)} />
<div className="bank-drop-panel" role="listbox" aria-label={label}>
<div className="bank-drop-head"><span>{sel.length ? `เลือก ${sel.length}` : "เลือกได้หลายอัน"}</span>{sel.length > 0 && <button type="button" className="bank-drop-clear" onClick={() => setF(p => ({ ...p, [key]: [] }))}>ล้าง</button>}</div>
{options.map(([value, text]) => <label key={value} className={"bank-drop-opt" + (sel.includes(value) ? " checked" : "")}><input type="checkbox" checked={sel.includes(value)} onChange={() => toggleMulti(key, value)} /><span>{text}</span></label>)}
</div>
</>}
</div>;
})}
</div>}
<div className="result-summary" role="status"><span>{loading ? "กำลังโหลดข้อสอบ…" : loadError ? "โหลดข้อมูลไม่สำเร็จ" : `พบ ${filtered.length} ข้อ จาก ${items.length} ข้อที่โหลด`}{!loading && items.length === 500 ? " · แสดง 500 ข้อล่าสุด" : ""}</span>{hasFilter && <button className="text-action" onClick={() => setF({ q: "", domain: [], task: [], spec: [], icd: [], status: "", type: bankType, year: [] })}>ล้างตัวกรองทั้งหมด</button>}</div>
{loadError ? <div className="empty card" role="alert"><p>โหลดคลังข้อสอบไม่สำเร็จ กรุณาลองอีกครั้ง</p><button className="btn ghost" onClick={load}>ลองใหม่</button></div> : <div className="tablewrap">
<table className="bank-table"><caption className="sr-only">รายการข้อสอบที่ตรงกับตัวกรอง</caption>
<thead><tr>
<th aria-sort={aria("id")}><button type="button" className="th-sort" onClick={() => toggleSort("id")}>#{arrow("id")}</button></th>
<th aria-sort={aria("stem")}><button type="button" className="th-sort" onClick={() => toggleSort("stem")}>ข้อสอบ{arrow("stem")}</button></th>
<th aria-sort={aria("cat")}><button type="button" className="th-sort" onClick={() => toggleSort("cat")}>หมวดหลัก{arrow("cat")}</button></th>
<th aria-sort={aria("sub")}><button type="button" className="th-sort" onClick={() => toggleSort("sub")}>หมวดย่อย{arrow("sub")}</button></th>
<th aria-sort={aria("task")}><button type="button" className="th-sort" onClick={() => toggleSort("task")}>ภารกิจ{arrow("task")}</button></th>
<th aria-sort={aria("spec")}><button type="button" className="th-sort" onClick={() => toggleSort("spec")}>สาขา{arrow("spec")}</button></th>
<th aria-sort={aria("icd")}><button type="button" className="th-sort" onClick={() => toggleSort("icd")}>ICD{arrow("icd")}</button></th>
<th aria-sort={aria("author")}><button type="button" className="th-sort" onClick={() => toggleSort("author")}>ผู้ออก{arrow("author")}</button></th>
<th aria-sort={aria("status")}><button type="button" className="th-sort" onClick={() => toggleSort("status")}>สถานะ{arrow("status")}</button></th>
<th><span className="sr-only">การดำเนินการ</span></th>
</tr></thead>
<tbody>
{loading && <tr><td colSpan={10}><div className="empty">กำลังโหลด…</div></td></tr>}
{!loading && sorted.length === 0 && <tr><td colSpan={10}><div className="empty"><h3>{items.length ? "ไม่พบข้อสอบที่ตรงกับการค้นหา" : "ยังไม่มีข้อสอบในคลัง"}</h3><p>{items.length ? "ลองเปลี่ยนคำค้นหาหรือล้างตัวกรอง" : canWrite ? "เริ่มต้นด้วยปุ่มสร้างข้อสอบด้านบน" : "ข้อสอบจะแสดงที่นี่เมื่อมีการเพิ่มเข้าคลัง"}</p></div></td></tr>}
{!loading && sorted.map(it => <tr key={it.id}>
<td className="item-idcell">#{it.id}</td>
<td><div className="item-meta"><span className={"pill " + it.type}>{it.type.toUpperCase()}</span>{it.is_sample && <span className="pill draft" title="ข้อสอบตัวอย่างที่ ศรว. เผยแพร่ — ใช้จัดสอบจริงไม่ได้">🧪 ตัวอย่าง ศรว.</span>}<span>{it.exam_year ? `ปี ${it.exam_year}` : ""}</span></div><button className="item-title" disabled={previewOnly} onClick={() => setPreviewing(it)}>{(stems[it.current_version_id] || "ยังไม่มีข้อความโจทย์").slice(0, 160)}</button><div className="item-detail">{it.use_count > 0 ? `ใช้สอบแล้ว ${it.use_count} ครั้ง` : "ยังไม่เคยใช้สอบ"}</div></td>
<td><div className="item-cat-main">{domainTitle(it.nl_domain_code) || "—"}</div></td>
<td>{it.nl_subitem || "—"}</td>
<td>{taskName(it.physician_task) || "—"}</td>
<td>{specName(it.specialty_id) || "—"}</td>
<td title={ICD_TH[it.icd_system] || ""}>{it.icd_system ? ICD_ROMAN[it.icd_system] : "—"}</td>
<td>{authors[it.author_id] || "—"}</td><td><span className={"pill " + it.status}>{STATUS_TH[it.status]}</span></td><td><div className="item-actions"><button className="btn ghost sm" disabled={previewOnly} title={previewOnly ? "ตัวอย่างนี้แสดงเฉพาะรายการและตัวกรอง" : undefined} aria-label={"เปิดข้อสอบ " + it.id} onClick={() => setPreviewing(it)}>เปิด</button>{canWrite && <button className="btn ghost sm" disabled={previewOnly} aria-label={"แก้ไขข้อสอบ " + it.id} onClick={() => setEditing(it)}>แก้ไข</button>}</div></td>
</tr>)}
</tbody></table></div>}
{previewing && <ItemPreview sb={sb} bp={bp} item={previewing} authorName={authors[previewing.author_id]}
canWrite={canWrite} canApprove={canApprove} notify={notify} onChanged={load}
onEdit={() => { const it = previewing; setPreviewing(null); setEditing(it); }}
onClose={() => setPreviewing(null)} />}
{editing && <ItemEditor initialType={bankType} notify={notify} sb={sb} bp={bp} item={editing === "new" ? null : editing} canApprove={canApprove}
onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} notify={notify} />}
</>
);
}
