"use client";
import { useEffect, useState } from "react";
import { STATUS_TH } from "../lib/constants";
import { StemImages, OptImage } from "./QImages";
const fdate = (iso) => iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—";
export default function ItemPreview({ sb, bp, item, authorName, canWrite, canApprove, onEdit, onClose, onChanged, notify }) {
const [ver, setVer] = useState(null);
const [options, setOptions] = useState([]);
const [stats, setStats] = useState([]);
const [review, setReview] = useState(null);
const [usage, setUsage] = useState([]);
const [usageLog, setUsageLog] = useState([]);
const [busy, setBusy] = useState(false);
const [sets, setSets] = useState([]);
const [chosenSet, setChosenSet] = useState("");
useEffect(() => {
(async () => {
if (item.current_version_id) {
const { data: v } = await sb.from("bank_item_versions").select("*").eq("id", item.current_version_id).maybeSingle();
setVer(v || null);
if (item.type === "mcq") {
const { data: o } = await sb.from("bank_item_options").select("*").eq("version_id", item.current_version_id).order("order_index");
setOptions(o || []);
}
}
const { data: st } = await sb.from("bank_item_stats").select("*").eq("item_id", item.id).order("computed_at", { ascending: false });
setStats(st || []);
const { data: rs } = await sb.from("v_item_review_summary").select("*").eq("item_id", item.id).maybeSingle();
setReview(rs || null);
const { data: us } = await sb.rpc("bank_item_usage", { _item_id: item.id });
setUsage(us || []);
const { data: ul } = await sb.from("bank_item_usage_log").select("*").eq("item_id", item.id).order("used_on", { ascending: false });
setUsageLog(ul || []);
})();
}, [item, sb]);
useEffect(() => {
if (!canApprove || item.type !== "mcq") return;
sb.from("exam_sets").select("id,name,active_state").eq("kind", "mcq").neq("active_state", "inactive").order("id").then(({ data }) => setSets(data || []));
}, [sb, canApprove, item.type]);
const addToSet = async () => {
if (!chosenSet) return;
setBusy(true);
try {
const { data: ex } = await sb.from("exam_set_items").select("id").eq("exam_set_id", chosenSet).eq("item_id", item.id).maybeSingle();
if (ex) { notify && notify("ข้อนี้อยู่ในชุดนี้แล้ว"); return; }
const { data: mx } = await sb.from("exam_set_items").select("position").eq("exam_set_id", chosenSet).order("position", { ascending: false }).limit(1);
const pos = ((mx && mx[0]?.position) || 0) + 1;
const { error } = await sb.from("exam_set_items").insert({ exam_set_id: Number(chosenSet), item_id: item.id, position: pos, points: 1 });
if (error) throw error;
notify && notify("เพิ่มข้อ #" + item.id + " เข้าชุด “" + (sets.find((s) => String(s.id) === String(chosenSet))?.name || "") + "” แล้ว");
setChosenSet("");
} catch (e) { notify && notify("เพิ่มเข้าชุดไม่สำเร็จ: " + (e.message || e)); }
finally { setBusy(false); }
};
const domainIdx = bp.domains.findIndex((d) => d.code === item.nl_domain_code);
const domain = domainIdx >= 0 ? bp.domains[domainIdx] : null;
const domainTitle = domain?.title || item.nl_domain_code || "—";
const domainNo = domainIdx >= 0 ? domainIdx + 1 : null;
const subList = bp.subitems.filter((s) => s.domain_code === item.nl_domain_code);
const subNo = item.nl_subitem ? (subList.findIndex((s) => s.name === item.nl_subitem) + 1) : 0;
const taskName = bp.tasks.find((t) => t.code === item.physician_task)?.name || "—";
const specName = bp.specs.find((s) => s.id === item.specialty_id)?.name_th || "—";
const perOption = ver?.rationale_mode === "per_option";
const researchCode = [
domainNo ? "NL" + domainNo + (subNo ? "." + subNo : "") : null,
item.physician_task || null,
item.specialty_id ? "S" + item.specialty_id : null,
item.exam_year ? "Y" + item.exam_year : null,
].filter(Boolean).join(" · ") || "—";
const buildCopyText = () => {
const L = [];
L.push("ข้อ #" + item.id + (item.exam_year ? "  (ปี พ.ศ. " + item.exam_year + ")" : ""));
L.push("หมวด: " + domainTitle + (item.nl_subitem ? " → " + item.nl_subitem : "") + " | ภารกิจ: " + taskName + " | สาขา: " + specName);
L.push("");
L.push(ver?.stem || "");
L.push("");
if (item.type === "mcq") {
options.forEach((o) => L.push(o.label + ". " + o.body + (o.is_correct ? "  *" : "")));
const c = options.find((o) => o.is_correct);
L.push("");
L.push("เฉลย: " + (c?.label || "-"));
if (perOption) options.forEach((o) => { if (o.rationale) L.push("   " + o.label + ": " + o.rationale); });
else if (ver?.rationale) L.push("คำอธิบาย: " + ver.rationale);
} else {
L.push("แนวคำตอบ: " + (ver?.meq_model_answer || "-"));
if (ver?.rationale) L.push("เกณฑ์: " + ver.rationale);
}
return L.join("\n");
};
const copy = async () => {
try { await navigator.clipboard.writeText(buildCopyText()); notify && notify("คัดลอกแล้ว — วางใน Word ได้เลย"); }
catch { notify && notify("คัดลอกไม่สำเร็จ (เบราว์เซอร์ไม่อนุญาต)"); }
};
const duplicate = async () => {
setBusy(true);
const { data, error } = await sb.rpc("bank_duplicate_item", { _id: item.id });
setBusy(false);
if (error) return notify && notify("ทำซ้ำไม่สำเร็จ: " + error.message);
notify && notify("ทำซ้ำเป็นข้อใหม่ #" + data + " (สถานะ: ร่าง)");
onClose(); onChanged && onChanged();
};
const del = async () => {
if (!confirm("ลบข้อ #" + item.id + " ถาวร?\n(ถ้าอยู่ในชุดข้อสอบ หรือเคยใช้สอบจริง จะลบไม่ได้ — ให้ใช้ปุ่ม “ปลดออกจากคลัง” แทน)")) return;
setBusy(true);
const { error } = await sb.rpc("bank_delete_item", { _id: item.id });
setBusy(false);
if (error) return notify && notify("ลบไม่ได้: " + error.message);
notify && notify("ลบข้อ #" + item.id + " แล้ว");
onClose(); onChanged && onChanged();
};
const setStatus = async (newStatus, verb) => {
if (newStatus === "retired" && !confirm("ปลดข้อ #" + item.id + " ออกจากคลัง?\nข้อจะไม่ถูกนำไปใช้สอบใหม่ แต่ยังเก็บไว้ในระบบ และนำกลับเข้าคลังได้ภายหลัง")) return;
setBusy(true);
const { error } = await sb.from("bank_items").update({ status: newStatus }).eq("id", item.id);
setBusy(false);
if (error) return notify && notify(verb + "ไม่สำเร็จ: " + error.message);
notify && notify(verb + "ข้อ #" + item.id + " แล้ว");
onClose(); onChanged && onChanged();
};
return (
<div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
<div className="modal">
<div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
<div className="row" style={{ gap: 8, alignItems: "center" }}>
<span style={{ fontWeight: 700, color: "var(--accent)" }}>#{item.id}</span>
<span className={"pill " + item.type}>{item.type.toUpperCase()}</span>
<span className={"pill " + item.status}>{STATUS_TH[item.status]}</span>
{item.is_sample && <span className="pill draft" title="ข้อสอบตัวอย่างที่ ศรว. เผยแพร่ — ใช้จัดสอบจริงไม่ได้ แก้ไข/ทำซ้ำเพื่อสร้างข้อคู่ขนานได้">🧪 ตัวอย่าง ศรว.</span>}
{item.exam_year && <span className="pill" style={{ background: "var(--accent-dark)" }}>ปี {item.exam_year}</span>}
{usage.length > 0 ? <span className="pill approved">ใช้จริง {usage.length} ครั้ง</span> : item.use_count > 0 ? <span className="pill approved">ใช้แล้ว {item.use_count}</span> : <span className="muted">ยังไม่เคยใช้</span>}
</div>
<button className="btn ghost sm" onClick={onClose}>ปิด</button>
</div>
<div className="metagrid">
<div><span className="mk">หมวด</span>{domainTitle}{item.nl_subitem ? " → " + item.nl_subitem : ""}</div>
<div><span className="mk">ภารกิจ</span>{taskName}</div>
<div><span className="mk">สาขา</span>{specName}</div>
<div><span className="mk">Bloom</span>{item.bloom_level || "—"}</div>
<div><span className="mk">ความยาก</span>{item.difficulty_target || "—"}</div>
<div><span className="mk">ผู้ออกข้อสอบ</span>{authorName || "—"}</div>
<div><span className="mk">รหัสวิจัย (code)</span>{researchCode}</div>
<div><span className="mk">ปีการศึกษา (พ.ศ.)</span>{item.exam_year || "—"}</div>
</div>
<div className="datestrip">
<span><b>ออกข้อสอบ:</b> {fdate(item.created_at)}</span>
<span><b>อนุมัติเข้าคลัง:</b> {fdate(item.approved_at)}</span>
<span><b>ใช้จริงล่าสุด:</b> {fdate(item.last_used_at)}</span>
<span><b>ปลดออกจากคลัง:</b> {fdate(item.retired_at)}</span>
</div>
<div className="pv-stem">{ver?.stem || "—"}</div>
<StemImages images={ver?.stem_images} />
{item.type === "mcq" ? (
<div style={{ marginBottom: 12 }}>
{options.map((o) => (
<div key={o.id} className={"pv-opt" + (o.is_correct ? " correct" : "")}>
<span className="lb">{o.label}</span>
<div style={{ flex: 1 }}>
<div>{o.body}{o.is_correct && <span className="pv-badge">เฉลย</span>}</div>
<OptImage url={o.image_url} width={o.image_width} />
{perOption && o.rationale && <div className="pv-orat">{o.rationale}</div>}
</div>
</div>
))}
</div>
) : (
<div className="pv-block"><span className="mk">แนวคำตอบ (MEQ)</span>{ver?.meq_model_answer || "—"}{ver?.meq_max_score != null && <span className="muted"> · เต็ม {ver.meq_max_score}</span>}</div>
)}
{!perOption && ver?.rationale && <div className="pv-block"><span className="mk">เฉลยอธิบาย</span>{ver.rationale}</div>}
<div className="grid2" style={{ marginTop: 6 }}>
<div className="pv-panel">
<div className="mk">ผลวิเคราะห์ข้อสอบ (Item analysis)</div>
{stats.length === 0 ? <div className="muted">ยังไม่เคยใช้สอบ — ไม่มีผลวิเคราะห์</div> : (
<table style={{ marginTop: 6 }}><thead><tr><th>N</th><th>ความยาก (p)</th><th>อำนาจจำแนก</th></tr></thead>
<tbody>{stats.map((s) => <tr key={s.id}><td>{s.n ?? "—"}</td><td>{s.p_value ?? "—"}</td><td>{s.discrimination ?? "—"}</td></tr>)}</tbody></table>
)}
</div>
<div className="pv-panel">
<div className="mk">คะแนนวิพากษ์ (AI index)</div>
{review && review.n_reviews > 0
? <div><span className="pv-big">{review.avg_ai_score}</span><span className="muted"> เฉลี่ยจากกรรมการ {review.n_reviews} คน</span></div>
: <div className="muted">ยังไม่มีการวิพากษ์ — เปิดที่แท็บ “วิพากษ์ข้อสอบ”</div>}
</div>
</div>
<div className="pv-panel" style={{ marginTop: 10 }}>
<div className="mk">ประวัติการใช้งานจริง ({usage.length} ครั้ง)</div>
{usage.length === 0 ? <div className="muted">ยังไม่เคยถูกนำไปใช้สอบจริง</div> : (
<table style={{ marginTop: 6 }}><thead><tr><th>การสอบ</th><th>ชุด</th><th>วันที่</th><th>สถานะ</th></tr></thead>
<tbody>{usage.map((u) => <tr key={u.assignment_id}><td>{u.title}</td><td>{u.set_name}</td><td>{fdate(u.open_at)}</td><td>{u.status === "open" ? "เปิดสอบ" : "ปิดแล้ว"}</td></tr>)}</tbody></table>
)}
{usageLog.length > 0 && <>
<div className="mk" style={{ marginTop: 10 }}>บันทึกการใช้ (log) — {usageLog.length} ครั้ง</div>
<table style={{ marginTop: 6 }}><thead><tr><th>วันที่ใช้สอบ</th><th>รอบ / หมายเหตุ</th><th>ที่มา</th><th>ผู้เข้าสอบ</th></tr></thead>
<tbody>{usageLog.map((u) => <tr key={u.id}><td>{fdate(u.used_on)}</td><td>{u.note || "—"}</td><td>{u.source || "—"}</td><td>{u.n_examinees ?? "—"}</td></tr>)}</tbody></table>
</>}
</div>
{canApprove && item.type === "mcq" && sets.length > 0 && <div className="row" style={{ gap: 6, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
<span className="mk" style={{ margin: 0 }}>เพิ่มเข้าชุดข้อสอบ{item.is_sample ? " (ข้อตัวอย่าง — เปิดสอบได้เฉพาะรอบ demo)" : ""}</span>
<select value={chosenSet} onChange={(e) => setChosenSet(e.target.value)} disabled={busy}><option value="">— เลือกชุด —</option>{sets.map((s) => <option key={s.id} value={s.id}>{s.name}{s.active_state === "pending" ? " (pending)" : ""}</option>)}</select>
<button className="btn ghost sm" disabled={busy || !chosenSet} onClick={addToSet}>＋ เพิ่มเข้าชุด</button>
</div>}
<div className="row" style={{ justifyContent: "space-between", marginTop: 14, alignItems: "center" }}>
<div className="row" style={{ gap: 6 }}>
<button className="btn ghost sm" onClick={copy}>📋 คัดลอกไป Word</button>
{canWrite && <button className="btn ghost sm" onClick={duplicate} disabled={busy}>⧉ ทำซ้ำ</button>}
{canApprove && item.status !== "retired" && <button className="btn ghost sm" style={{ color: "var(--warn, #b26a00)" }} onClick={() => setStatus("retired", "ปลดออกจากคลัง")} disabled={busy}>⤓ ปลดออกจากคลัง</button>}
{canApprove && item.status === "retired" && <button className="btn ghost sm" style={{ color: "var(--good)" }} onClick={() => setStatus("approved", "นำกลับเข้าคลัง")} disabled={busy}>↩ นำกลับเข้าคลัง</button>}
{canApprove && <button className="btn ghost sm" style={{ color: "var(--stop)" }} onClick={del} disabled={busy}>🗑 ลบ</button>}
</div>
{canWrite && onEdit && <button className="btn" onClick={onEdit}>แก้ไข</button>}
</div>
</div>
</div>
);
}
