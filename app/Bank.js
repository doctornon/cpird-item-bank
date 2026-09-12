"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { STATUS, STATUS_TH } from "../lib/constants";
import ItemEditor from "./ItemEditor";
import ItemPreview from "./ItemPreview";
export default function Bank({ sb, bp, me, canWrite, canApprove, notify, initialStatus = "", previewOnly = false, bankType = "mcq" }) {
const [items, setItems] = useState([]);
const [stems, setStems] = useState({});
const [authors, setAuthors] = useState({});
const [loading, setLoading] = useState(true);
const [f, setF] = useState({ q: "", domain: "", task: "", spec: "", status: initialStatus, type: bankType, year: "" });
const [advanced, setAdvanced] = useState(false);
const [loadError, setLoadError] = useState(false);
const [editing, setEditing] = useState(null);
const [previewing, setPreviewing] = useState(null);
const load = useCallback(async () => {
setLoading(true);
setLoadError(false);
const { data, error } = await sb.from("bank_items").select("*").eq("type", bankType).order("updated_at", { ascending: false }).limit(500);
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
const years = [...new Set(items.map((i) => i.exam_year).filter(Boolean))].sort((a, b) => b - a);
const filtered = items.filter((it) => {
if (f.domain && it.nl_domain_code !== f.domain) return false;
if (f.task && it.physician_task !== f.task) return false;
if (f.spec && String(it.specialty_id) !== f.spec) return false;
if (f.status && it.status !== f.status) return false;
if (f.type && it.type !== f.type) return false;
if (f.year && String(it.exam_year) !== f.year) return false;
if (f.q) {
const hay = ((stems[it.current_version_id] || "") + " " + (it.nl_subitem || "")).toLowerCase();
if (!hay.includes(f.q.toLowerCase())) return false;
}
return true;
});
const counts = useMemo(() => {
const c = { total: items.length };
STATUS.forEach((s) => (c[s] = items.filter((i) => i.status === s).length));
return c;
}, [items]);
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
<button className="btn ghost" aria-expanded={advanced} aria-controls="bank-advanced" onClick={() => setAdvanced(!advanced)}>ตัวกรองเพิ่มเติม{[f.domain, f.task, f.spec, f.year].filter(Boolean).length ? ` (${[f.domain, f.task, f.spec, f.year].filter(Boolean).length})` : ""}</button>
</div>
{advanced && <div id="bank-advanced" className="bank-advanced">
{[["domain", "หมวด", bp.domains.map(d => [d.code, d.title])], ["task", "ภารกิจ", bp.tasks.map(t => [t.code, t.name])], ["spec", "สาขา", bp.specs.map(x => [String(x.id), x.name_th])], ["year", "ปี พ.ศ.", years.map(y => [String(y), y])]].map(([key, label, options]) => <div key={key}><label htmlFor={"filter-" + key}>{label}</label><select id={"filter-" + key} value={f[key]} onChange={e => setF({ ...f, [key]: e.target.value })}><option value="">ทั้งหมด</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></div>)}
</div>}
<div className="result-summary" role="status"><span>{loading ? "กำลังโหลดข้อสอบ…" : loadError ? "โหลดข้อมูลไม่สำเร็จ" : `พบ ${filtered.length} ข้อ จาก ${items.length} ข้อที่โหลด`}{!loading && items.length === 500 ? " · แสดง 500 ข้อล่าสุด" : ""}</span>{Object.entries(f).some(([key,value]) => key !== "type" && value) && <button className="text-action" onClick={() => setF({ q: "", domain: "", task: "", spec: "", status: "", type: bankType, year: "" })}>ล้างตัวกรองทั้งหมด</button>}</div>
{loadError ? <div className="empty card" role="alert"><p>โหลดคลังข้อสอบไม่สำเร็จ กรุณาลองอีกครั้ง</p><button className="btn ghost" onClick={load}>ลองใหม่</button></div> : <div className="tablewrap">
<table className="bank-table"><caption className="sr-only">รายการข้อสอบที่ตรงกับตัวกรอง</caption>
<thead><tr><th>ข้อสอบ</th><th>หมวด / สาขา</th><th>ผู้ออก</th><th>สถานะ</th><th><span className="sr-only">การดำเนินการ</span></th></tr></thead>
<tbody>
{loading && <tr><td colSpan={5}><div className="empty">กำลังโหลด…</div></td></tr>}
{!loading && filtered.length === 0 && <tr><td colSpan={5}><div className="empty"><h3>{items.length ? "ไม่พบข้อสอบที่ตรงกับการค้นหา" : "ยังไม่มีข้อสอบในคลัง"}</h3><p>{items.length ? "ลองเปลี่ยนคำค้นหาหรือล้างตัวกรอง" : canWrite ? "เริ่มต้นด้วยปุ่มสร้างข้อสอบด้านบน" : "ข้อสอบจะแสดงที่นี่เมื่อมีการเพิ่มเข้าคลัง"}</p></div></td></tr>}
{!loading && filtered.map(it => <tr key={it.id}>
<td><div className="item-meta"><span>#{it.id}</span><span className={"pill " + it.type}>{it.type.toUpperCase()}</span><span>{it.exam_year ? `ปี ${it.exam_year}` : ""}</span></div><button className="item-title" disabled={previewOnly} onClick={() => setPreviewing(it)}>{(stems[it.current_version_id] || "ยังไม่มีข้อความโจทย์").slice(0, 160)}</button><div className="item-detail">{it.use_count > 0 ? `ใช้สอบแล้ว ${it.use_count} ครั้ง` : "ยังไม่เคยใช้สอบ"}</div></td>
<td><div>{it.nl_domain_code || "ไม่ระบุหมวด"}{it.nl_subitem ? " · " + it.nl_subitem : ""}</div><div className="item-detail">{specName(it.specialty_id) || "ไม่ระบุสาขา"} · {taskName(it.physician_task) || "ไม่ระบุภารกิจ"}</div></td>
<td>{authors[it.author_id] || "—"}</td><td><span className={"pill " + it.status}>{STATUS_TH[it.status]}</span></td><td><button className="btn ghost sm" disabled={previewOnly} title={previewOnly ? "ตัวอย่างนี้แสดงเฉพาะรายการและตัวกรอง" : undefined} aria-label={"เปิดข้อสอบ " + it.id} onClick={() => setPreviewing(it)}>เปิด</button></td>
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
