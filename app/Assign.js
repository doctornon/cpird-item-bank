"use client";
import { useEffect, useState, useCallback } from "react";
const ST_TH = { draft: "ร่าง", open: "เปิดสอบ", closed: "ปิดแล้ว" };
function toLocalInput(iso) {
if (!iso) return "";
const d = new Date(iso); const pad = (n) => String(n).padStart(2, "0");
return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export default function Assign({ sb, bp, me, notify }) {
const [sets, setSets] = useState([]);
const [centers, setCenters] = useState([]);
const [list, setList] = useState([]);
const [sel, setSel] = useState(null);
const [roster, setRoster] = useState([]);
const [creating, setCreating] = useState(false);
const [busy, setBusy] = useState(false);
const blank = {
title: "", exam_set_id: "", target: "all", medical_center_id: "",
open_at: "", close_at: "", duration_min: 180,
randomize_questions: true, randomize_options: false,
attempts_allowed: 1, pass_mark: 50, show_score: true, show_answers: true, access_code: "",
};
const [form, setForm] = useState(blank);
const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));
const loadList = useCallback(async () => {
const { data } = await sb.from("exam_assignments").select("*").order("created_at", { ascending: false });
setList(data || []);
}, [sb]);
useEffect(() => {
(async () => {
const [{ data: es }, { data: mc }] = await Promise.all([
sb.from("exam_sets").select("id,name,status").order("updated_at", { ascending: false }),
sb.from("medical_centers").select("id,name").order("name"),
]);
setSets(es || []); setCenters(mc || []);
})();
loadList();
}, [sb, loadList]);
const setName = (id) => sets.find((s) => s.id === id)?.name || "—";
const centerName = (id) => centers.find((c) => c.id === id)?.name || "";
const loadRoster = useCallback(async (id) => {
const { data } = await sb.rpc("exam_roster", { _assignment_id: id });
setRoster(data || []);
}, [sb]);
const openDetail = async (a) => { setSel(a); setCreating(false); await loadRoster(a.id); };
const create = async () => {
if (!form.title.trim() || !form.exam_set_id) return notify("กรุณากรอกชื่อและเลือกชุดข้อสอบ");
setBusy(true);
const payload = {
title: form.title, exam_set_id: Number(form.exam_set_id), target: form.target,
medical_center_id: form.target === "center" && form.medical_center_id ? Number(form.medical_center_id) : null,
open_at: form.open_at ? new Date(form.open_at).toISOString() : null,
close_at: form.close_at ? new Date(form.close_at).toISOString() : null,
duration_min: Number(form.duration_min) || 180,
randomize_questions: form.randomize_questions, randomize_options: form.randomize_options,
attempts_allowed: Number(form.attempts_allowed) || 1, pass_mark: Number(form.pass_mark) || 0,
show_score: form.show_score, show_answers: form.show_answers,
access_code: form.access_code || null, created_by: me,
};
const { data, error } = await sb.from("exam_assignments").insert(payload).select("*").single();
setBusy(false);
if (error) return notify("ผิดพลาด: " + error.message);
setForm(blank); notify("สร้างการสอบแล้ว (สถานะ: ร่าง)"); await loadList(); openDetail(data);
};
const publish = async (a) => {
if (!confirm("เปิดสอบ “" + a.title + "” ? นักศึกษาจะเข้าทำได้ทันทีตามช่วงเวลาที่ตั้งไว้")) return;
const { error } = await sb.rpc("exam_publish", { _assignment_id: a.id });
if (error) return notify("ผิดพลาด: " + error.message);
notify("เปิดสอบแล้ว"); await loadList(); setSel({ ...a, status: "open" });
};
const close = async (a) => {
const { error } = await sb.rpc("exam_close", { _assignment_id: a.id });
if (error) return notify("ผิดพลาด: " + error.message);
notify("ปิดสอบแล้ว"); await loadList(); setSel({ ...a, status: "closed" });
};
const computeStats = async (a) => {
setBusy(true);
const { data, error } = await sb.rpc("exam_compute_stats", { _assignment_id: a.id });
setBusy(false);
if (error) return notify("ผิดพลาด: " + error.message);
notify("คำนวณผลวิเคราะห์ข้อสอบแล้ว " + data + " ข้อ (ดูได้ในคลังข้อสอบ)");
};
const submittedCount = roster.filter((r) => r.status !== "in_progress").length;
const avgPercent = submittedCount ? (roster.filter((r) => r.percent != null).reduce((s, r) => s + Number(r.percent), 0) / submittedCount).toFixed(1) : "—";
return (
<div className="theater">
<div className="th-side">
<button className="btn" style={{ width: "100%", marginBottom: 10 }} onClick={() => { setCreating(true); setSel(null); setForm(blank); }}>+ สร้างการสอบ</button>
<div className="muted" style={{ marginBottom: 6 }}>การสอบทั้งหมด ({list.length})</div>
<div className="th-list">
{list.map((a) => (
<button key={a.id} className={"th-li" + (sel?.id === a.id ? " active" : "")} onClick={() => openDetail(a)}>
<span className="th-txt" style={{ flex: 1 }}>{a.title}</span>
<span className={"pill " + (a.status === "open" ? "approved" : a.status === "closed" ? "retired" : "draft")}>{ST_TH[a.status]}</span>
</button>
))}
{list.length === 0 && <div className="muted">ยังไม่มีการสอบ</div>}
</div>
</div>
<div className="th-stage">
{creating ? (
<>
<h3 style={{ marginBottom: 12 }}>สร้างการสอบใหม่</h3>
<div className="field"><label>ชื่อการสอบ</label><input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="เช่น สอบ Comprehensive รอบเช้า 15 มี.ค. 2569" /></div>
<div className="field"><label>ชุดข้อสอบ</label>
<select value={form.exam_set_id} onChange={(e) => set("exam_set_id", e.target.value)}>
<option value="">— เลือกชุดข้อสอบ —</option>
{sets.map((s) => <option key={s.id} value={s.id}>{s.name}{s.status === "ready" ? " ✓" : ""}</option>)}
</select></div>
<div className="grid2">
<div className="field"><label>กลุ่มเป้าหมาย</label>
<select value={form.target} onChange={(e) => set("target", e.target.value)}>
<option value="all">ทุกศูนย์ / ทุกคน</option><option value="center">เฉพาะศูนย์แพทย์</option>
</select></div>
<div className="field"><label>ศูนย์แพทย์ (ถ้าเลือกเฉพาะศูนย์)</label>
<select value={form.medical_center_id} onChange={(e) => set("medical_center_id", e.target.value)} disabled={form.target !== "center"}>
<option value="">— เลือกศูนย์ —</option>{centers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
</select></div>
</div>
<div className="grid2">
<div className="field"><label>เปิดให้เข้าสอบ (open)</label><input type="datetime-local" value={form.open_at} onChange={(e) => set("open_at", e.target.value)} /></div>
<div className="field"><label>ปิดรับเข้าสอบ (close)</label><input type="datetime-local" value={form.close_at} onChange={(e) => set("close_at", e.target.value)} /></div>
</div>
<div className="grid3">
<div className="field"><label>เวลาทำ (นาที)</label><input type="number" value={form.duration_min} onChange={(e) => set("duration_min", e.target.value)} /></div>
<div className="field"><label>จำนวนครั้งที่ทำได้</label><input type="number" value={form.attempts_allowed} onChange={(e) => set("attempts_allowed", e.target.value)} /></div>
<div className="field"><label>เกณฑ์ผ่าน (%)</label><input type="number" value={form.pass_mark} onChange={(e) => set("pass_mark", e.target.value)} /></div>
</div>
<div className="field"><label>รหัสเข้าสอบ (ถ้ามี)</label><input value={form.access_code} onChange={(e) => set("access_code", e.target.value)} placeholder="เว้นว่าง = ไม่ต้องใช้รหัส" /></div>
<div className="row" style={{ gap: 18, margin: "6px 0 14px" }}>
<label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={form.randomize_questions} onChange={(e) => set("randomize_questions", e.target.checked)} /> สลับลำดับข้อ</label>
<label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={form.randomize_options} onChange={(e) => set("randomize_options", e.target.checked)} /> สลับตัวเลือก</label>
<label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={form.show_score} onChange={(e) => set("show_score", e.target.checked)} /> แสดงคะแนนหลังส่ง</label>
<label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={form.show_answers} onChange={(e) => set("show_answers", e.target.checked)} /> แสดงเฉลยหลังส่ง</label>
</div>
<div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
<button className="btn ghost" onClick={() => setCreating(false)}>ยกเลิก</button>
<button className="btn" onClick={create} disabled={busy}>{busy ? "กำลังบันทึก…" : "สร้าง (ร่าง)"}</button>
</div>
</>
) : !sel ? <div className="empty">เลือกการสอบทางซ้าย หรือกด “สร้างการสอบ”</div> : (
<>
<div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
<h3>{sel.title}</h3>
<span className={"pill " + (sel.status === "open" ? "approved" : sel.status === "closed" ? "retired" : "draft")}>{ST_TH[sel.status]}</span>
</div>
<div className="metagrid" style={{ marginTop: 10 }}>
<div><span className="mk">ชุดข้อสอบ</span>{setName(sel.exam_set_id)}</div>
<div><span className="mk">กลุ่ม</span>{sel.target === "all" ? "ทุกศูนย์" : centerName(sel.medical_center_id)}</div>
<div><span className="mk">เวลาทำ</span>{sel.duration_min} นาที</div>
<div><span className="mk">เปิด</span>{sel.open_at ? new Date(sel.open_at).toLocaleString("th-TH") : "—"}</div>
<div><span className="mk">ปิด</span>{sel.close_at ? new Date(sel.close_at).toLocaleString("th-TH") : "—"}</div>
<div><span className="mk">เกณฑ์ผ่าน</span>{sel.pass_mark}%</div>
<div><span className="mk">ทำได้</span>{sel.attempts_allowed} ครั้ง</div>
<div><span className="mk">สลับข้อ/ตัวเลือก</span>{sel.randomize_questions ? "ข้อ" : ""} {sel.randomize_options ? "ตัวเลือก" : ""}{!sel.randomize_questions && !sel.randomize_options ? "ไม่สลับ" : ""}</div>
<div><span className="mk">รหัสเข้าสอบ</span>{sel.access_code || "ไม่ใช้"}</div>
</div>
<div className="row" style={{ gap: 8, margin: "8px 0 16px" }}>
{sel.status === "draft" && <button className="btn" style={{ background: "var(--good)" }} onClick={() => publish(sel)}>เปิดสอบ</button>}
{sel.status === "open" && <button className="btn danger" onClick={() => close(sel)}>ปิดสอบ</button>}
{sel.status === "closed" && <button className="btn" onClick={() => publish(sel)}>เปิดอีกครั้ง</button>}
<button className="btn ghost" onClick={() => computeStats(sel)} disabled={busy}>คำนวณผลวิเคราะห์ข้อสอบ</button>
<button className="btn ghost sm" onClick={() => loadRoster(sel.id)}>รีเฟรช</button>
</div>
<div className="stat" style={{ marginBottom: 12 }}>
<div className="s"><div className="n">{roster.length}</div><div className="k">เข้าสอบ</div></div>
<div className="s"><div className="n">{submittedCount}</div><div className="k">ส่งแล้ว</div></div>
<div className="s"><div className="n">{avgPercent}</div><div className="k">คะแนนเฉลี่ย %</div></div>
</div>
<div className="tablewrap">
<table>
<thead><tr><th>ผู้เข้าสอบ</th><th>รหัส</th><th>สถานะ</th><th>คะแนน</th><th>%</th><th>ผล</th><th>ส่งเมื่อ</th><th>สลับแท็บ</th></tr></thead>
<tbody>
{roster.length === 0 && <tr><td colSpan={8}><div className="empty">ยังไม่มีผู้เข้าสอบ</div></td></tr>}
{roster.map((r, i) => (
<tr key={i}>
<td>{r.name}</td>
<td>{r.code || "—"}</td>
<td><span className={"pill " + (r.status === "submitted" ? "approved" : r.status === "expired" ? "retired" : "review")}>{r.status === "submitted" ? "ส่งแล้ว" : r.status === "expired" ? "หมดเวลา" : "กำลังทำ"}</span></td>
<td>{r.score != null ? r.score + "/" + r.max_score : "—"}</td>
<td>{r.percent != null ? r.percent : "—"}</td>
<td>{r.passed == null ? "—" : r.passed ? <span className="pill approved">ผ่าน</span> : <span className="pill retired">ไม่ผ่าน</span>}</td>
<td className="muted">{r.submitted_at ? new Date(r.submitted_at).toLocaleString("th-TH") : "—"}</td>
<td>{r.focus_lost > 0 ? <span className="pill review" title="สัญญาณเบื้องต้น ไม่ใช่หลักฐานการทุจริต">{r.focus_lost}</span> : <span className="muted">0</span>}</td>
</tr>
))}
</tbody>
</table>
</div>
<div className="muted" style={{ marginTop: 8 }}>* คอลัมน์ “สลับแท็บ” นับจำนวนครั้งที่หน้าจอสอบถูกสลับออก (soft signal) — เป็นเพียงสัญญาณเบื้องต้นเพื่อการติดตาม ไม่ใช่หลักฐานยืนยันการทุจริต และไม่สามารถตรวจจับการถ่ายภาพหน้าจอด้วยอุปกรณ์ภายนอกได้</div>
</>
)}
</div>
</div>
);
}
