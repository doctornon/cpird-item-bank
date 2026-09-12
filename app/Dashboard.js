"use client";
import { useEffect, useState, useCallback } from "react";
import { STATUS, STATUS_TH } from "../lib/constants";
const STATUS_COLOR = { draft: "var(--draft)", review: "var(--review)", approved: "var(--approved)", retired: "var(--retired)" };
function Donut({ segments, total }) {
const R = 52, C = 2 * Math.PI * R;
let acc = 0;
return (
<svg viewBox="0 0 140 140" style={{ width: 150, height: 150, flex: "none" }}>
<circle cx="70" cy="70" r={R} fill="none" stroke="var(--line)" strokeWidth="16" />
{total > 0 && segments.filter((s) => s.value > 0).map((s, i) => {
const frac = s.value / total, dash = frac * C;
const el = <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={s.color} strokeWidth="16" strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-acc * C} transform="rotate(-90 70 70)" />;
acc += frac;
return el;
})}
<text x="70" y="66" textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--ink)" fontFamily="Bai Jamjuree">{total}</text>
<text x="70" y="86" textAnchor="middle" fontSize="11" fill="var(--ink-faint)">ข้อทั้งหมด</text>
</svg>
);
}
function Bars({ rows }) {
const max = Math.max(1, ...rows.map((r) => r.value));
return (
<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
{rows.length === 0 && <div className="muted">ไม่มีข้อมูล</div>}
{rows.map((r, i) => (
<div key={i} className="bar">
<div className="bar-label" title={r.label}>{r.label}</div>
<div className="bar-track"><div className="bar-fill" style={{ width: (r.value / max * 100) + "%", background: r.color || "var(--accent)" }} /></div>
<div className="bar-val">{r.value}</div>
</div>
))}
</div>
);
}
function Heat({ cols, rows, matrix }) {
const max = Math.max(1, ...matrix.flat());
const color = (v) => v === 0 ? "var(--surface-2)" : `color-mix(in srgb, var(--accent) ${Math.round((0.18 + 0.82 * (v / max)) * 100)}%, var(--surface))`;
return (
<table className="heat">
<thead>
<tr>
<th style={{ minWidth: 132 }}>{"หมวด \\ " + (cols.axis || "")}</th>
{cols.items.map((c, i) => <th key={i} title={c.title || c.label}>{c.label}</th>)}
<th>รวม</th>
</tr>
</thead>
<tbody>
{rows.map((rw, r) => {
const rt = matrix[r].reduce((a, b) => a + b, 0);
return (
<tr key={r}>
<td title={rw.title}><b style={{ color: "var(--accent)" }}>{rw.label}</b>{rw.sub ? <span className="muted"> {rw.sub}</span> : null}</td>
{matrix[r].map((v, c) => <td key={c} style={{ background: color(v), fontWeight: v ? 600 : 400 }}>{v || "–"}</td>)}
<td style={{ fontWeight: 700 }}>{rt}</td>
</tr>
);
})}
<tr>
<td><b>รวม</b></td>
{cols.items.map((c, i) => <td key={i} style={{ fontWeight: 700 }}>{matrix.reduce((a, row) => a + row[i], 0)}</td>)}
<td style={{ fontWeight: 700 }}>{matrix.flat().reduce((a, b) => a + b, 0)}</td>
</tr>
</tbody>
</table>
);
}
export default function Dashboard({ sb, bp, notify, onOpenBank }) {
const [items, setItems] = useState([]);
const [stats, setStats] = useState([]);
const [loading, setLoading] = useState(true);
const load = useCallback(async () => {
setLoading(true);
const { data } = await sb.from("bank_items").select("id,type,status,exam_year,nl_domain_code,nl_subitem,physician_task,specialty_id,use_count").eq("type", "mcq").limit(5000);
setItems(data || []);
const { data: st } = await sb.from("bank_item_stats").select("item_id,n,p_value,discrimination,computed_at").order("computed_at", { ascending: false }).limit(20000);
const latest = {};
(st || []).forEach((s) => { if (!latest[s.item_id]) latest[s.item_id] = s; });
const itemIds = new Set((data || []).map(x => x.id));
setStats(Object.values(latest).filter(x => itemIds.has(x.item_id)));
setLoading(false);
}, [sb]);
useEffect(() => { load(); }, [load]);
const total = items.length;
const by = (pred) => items.filter(pred).length;
const approved = by((i) => i.status === "approved");
const review = by((i) => i.status === "review");
const draft = by((i) => i.status === "draft");
const mcq = by((i) => i.type === "mcq");
const meq = by((i) => i.type === "meq");
const used = by((i) => i.use_count > 0);
const statusSeg = STATUS.map((s) => ({ label: STATUS_TH[s], value: by((i) => i.status === s), color: STATUS_COLOR[s] }));
const domainRows = bp.domains.map((d) => ({ label: d.code, title: d.title, value: by((i) => i.nl_domain_code === d.code), color: "var(--accent)" }));
const noDomain = by((i) => !i.nl_domain_code);
const taskRows = bp.tasks.map((t) => ({ label: t.name, value: by((i) => i.physician_task === t.code), color: "#8b5cf6" }));
const specRows = bp.specs.map((s) => ({ label: s.name_th, value: by((i) => i.specialty_id === s.id), color: "var(--accent-2)" })).filter((r) => r.value > 0).sort((a, b) => b.value - a.value).slice(0, 12);
const years = [...new Set(items.map((i) => i.exam_year).filter(Boolean))].sort((a, b) => a - b);
const yearRows = years.map((y) => ({ label: "พ.ศ. " + y, value: by((i) => i.exam_year === y), color: "var(--accent-dark)" }));
const noYear = by((i) => !i.exam_year);
// Blueprint coverage: domain x physician task
const covTask = bp.domains.map((d) => bp.tasks.map((t) => by((i) => i.nl_domain_code === d.code && i.physician_task === t.code)));
const emptyCells = covTask.flat().filter((v) => v === 0).length;
const totalCells = bp.domains.length * bp.tasks.length;
// Coverage: domain x specialty (only specialties that have items)
const specsWithItems = bp.specs.filter((s) => items.some((i) => i.specialty_id === s.id));
const covSpec = bp.domains.map((d) => specsWithItems.map((s) => by((i) => i.nl_domain_code === d.code && i.specialty_id === s.id)));
// Item analysis (from bank_item_stats, latest per item)
const nStats = stats.length;
const pVals = stats.map((s) => Number(s.p_value)).filter((v) => !isNaN(v));
const dVals = stats.map((s) => Number(s.discrimination)).filter((v) => !isNaN(v));
const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : null;
const avgP = avg(pVals), avgD = avg(dVals);
const pBuckets = [
{ label: "ยากเกิน (<0.30)", value: pVals.filter((v) => v < 0.3).length, color: "var(--stop)" },
{ label: "เหมาะสม (0.30–0.85)", value: pVals.filter((v) => v >= 0.3 && v <= 0.85).length, color: "var(--good)" },
{ label: "ง่ายเกิน (>0.85)", value: pVals.filter((v) => v > 0.85).length, color: "var(--warn)" },
];
const dBuckets = [
{ label: "ติดลบ (<0) ⚠", value: dVals.filter((v) => v < 0).length, color: "var(--stop)" },
{ label: "ต่ำ (0–0.19)", value: dVals.filter((v) => v >= 0 && v < 0.2).length, color: "var(--warn)" },
{ label: "พอใช้ (0.20–0.29)", value: dVals.filter((v) => v >= 0.2 && v < 0.3).length, color: "var(--accent-2)" },
{ label: "ดี (≥0.30)", value: dVals.filter((v) => v >= 0.3).length, color: "var(--good)" },
];
if (loading) return <div className="empty">กำลังโหลดข้อมูลแดชบอร์ด…</div>;
return (
<div className="dashboard">
<div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
<div><h2>ภาพรวมคลัง MCQ</h2><p className="workspace-description">ติดตามงานทบทวนและความพร้อมของข้อสอบในคลัง</p></div>
<div className="row no-print" style={{ gap: 6 }}>
<button className="btn ghost sm" onClick={load}>รีเฟรช</button>
<button className="btn sm" onClick={() => window.print()}>พิมพ์ / บันทึก PDF</button>
</div>
</div>
<section className="work-queue" aria-labelledby="queue-title">
<div className="queue-intro"><h3 id="queue-title">งานในคลังข้อสอบ</h3><p>เลือกรายการเพื่อเปิดข้อสอบตามสถานะ</p></div>
{[["review", "รอทบทวน", review, "ตรวจเนื้อหาและพิจารณาความพร้อม"], ["draft", "ฉบับร่าง", draft, "ติดตามข้อสอบที่ยังอยู่ระหว่างจัดทำ"], ["approved", "พร้อมใช้", approved, "ดูข้อสอบที่อนุมัติแล้ว"]].map(([status, label, count, hint]) => <button key={status} className="queue-row" onClick={() => onOpenBank?.(status)}><span><strong>{label}</strong><small>{hint}</small></span><span className="queue-count">{count}<small>ข้อ</small></span><span aria-hidden="true">→</span></button>)}
</section>
<div className="inventory-summary"><span>ทั้งหมด <b>{total}</b> ข้อ</span><span>MCQ <b>{mcq}</b></span><span>เคยใช้สอบ <b>{used}</b> ข้อ</span></div>
<h3 className="report-heading">การกระจายและคุณภาพข้อสอบ</h3>
<div className="dash-grid">
<div className="card">
<div className="mk" style={{ marginBottom: 10 }}>สัดส่วนตามสถานะ</div>
<div className="row" style={{ gap: 16, alignItems: "center", flexWrap: "nowrap" }}>
<Donut segments={statusSeg} total={total} />
<div style={{ flex: 1, minWidth: 0 }}>
{statusSeg.map((s, i) => (
<div key={i} className="legend">
<span className="dot" style={{ background: s.color }} />
<span style={{ flex: 1 }}>{s.label}</span>
<b>{s.value}</b>
<span className="muted" style={{ width: 44, textAlign: "right" }}>{total ? Math.round(s.value / total * 100) : 0}%</span>
</div>
))}
</div>
</div>
</div>
<div className="card">
<div className="mk" style={{ marginBottom: 10 }}>ตามหมวด NL (I–IV){noDomain ? " · ยังไม่ระบุหมวด " + noDomain + " ข้อ" : ""}</div>
<Bars rows={domainRows} />
</div>
<div className="card">
<div className="mk" style={{ marginBottom: 10 }}>ตามภารกิจแพทย์</div>
<Bars rows={taskRows} />
</div>
<div className="card">
<div className="mk" style={{ marginBottom: 10 }}>ตามสาขา (12 อันดับแรก)</div>
<Bars rows={specRows} />
</div>
{yearRows.length > 0 && (
<div className="card">
<div className="mk" style={{ marginBottom: 10 }}>ตามปี พ.ศ.{noYear ? " · ยังไม่ระบุปี " + noYear + " ข้อ" : ""}</div>
<Bars rows={yearRows} />
</div>
)}
</div>
<div className="card" style={{ marginTop: 16 }}>
<div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
<div className="mk">ผลวิเคราะห์ข้อสอบ (Item analysis)</div>
<div className="muted">มีผลวิเคราะห์ {nStats} ข้อ (จากที่เคยใช้สอบจริง)</div>
</div>
{nStats === 0 ? <p className="muted" style={{ marginTop: 8 }}>ยังไม่มีข้อใดถูกนำไปใช้สอบและคำนวณผลวิเคราะห์ — เมื่อปิดสอบและกด “คำนวณผลวิเคราะห์ข้อสอบ” ในแท็บมอบหมายสอบ ค่าจะปรากฏที่นี่</p> : (
<>
<div className="stat" style={{ margin: "10px 0 6px" }}>
<div className="s"><div className="n">{avgP != null ? avgP.toFixed(2) : "—"}</div><div className="k">ความยากเฉลี่ย (p)</div></div>
<div className="s"><div className="n">{avgD != null ? avgD.toFixed(2) : "—"}</div><div className="k">อำนาจจำแนกเฉลี่ย (r)</div></div>
</div>
<div className="dash-grid">
<div>
<div className="mk" style={{ marginBottom: 10 }}>การกระจายความยาก (p-value)</div>
<Bars rows={pBuckets} />
<p className="muted" style={{ marginTop: 8 }}>p สูง = ข้อง่าย (คนตอบถูกมาก) · เหมาะสมประมาณ 0.30–0.85</p>
</div>
<div>
<div className="mk" style={{ marginBottom: 10 }}>การกระจายอำนาจจำแนก (discrimination)</div>
<Bars rows={dBuckets} />
<p className="muted" style={{ marginTop: 8 }}>ยิ่งสูงยิ่งจำแนกเก่ง-อ่อนได้ดี · ค่าติดลบ = ควรทบทวน/ปลดข้อ</p>
</div>
</div>
</>
)}
</div>
<div className="card" style={{ marginTop: 16 }}>
<div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
<div className="mk">Blueprint coverage — หมวด NL × ภารกิจแพทย์</div>
<div className="muted">ช่องว่าง {emptyCells}/{totalCells} ช่อง</div>
</div>
<p className="muted" style={{ marginBottom: 12 }}>ช่องสีจาง/“–” คือยังไม่มีข้อ — ใช้วางแผนออกข้อสอบให้ครอบคลุม blueprint</p>
<div className="tablewrap" style={{ boxShadow: "none" }}>
<Heat cols={{ axis: "ภารกิจ", items: bp.tasks.map((t) => ({ label: t.name, title: t.name })) }}
rows={bp.domains.map((d) => ({ label: d.code, title: d.title, sub: (d.title || "").replace(d.code, "").replace(/^[.\s]+/, "").slice(0, 18) }))}
matrix={covTask} />
</div>
</div>
<div className="card" style={{ marginTop: 16 }}>
<div className="mk" style={{ marginBottom: 4 }}>Coverage — หมวด NL × สาขา</div>
<p className="muted" style={{ marginBottom: 12 }}>แสดงเฉพาะสาขาที่มีข้อสอบในคลัง — เลื่อนแนวนอนเพื่อดูทุกสาขา</p>
{specsWithItems.length === 0 ? <div className="muted">ยังไม่มีข้อสอบที่ระบุสาขา</div> : (
<div className="tablewrap" style={{ boxShadow: "none" }}>
<Heat cols={{ axis: "สาขา", items: specsWithItems.map((s) => ({ label: (s.name_th || "").slice(0, 10), title: s.name_th })) }}
rows={bp.domains.map((d) => ({ label: d.code, title: d.title }))}
matrix={covSpec} />
</div>
)}
</div>
</div>
);
}
