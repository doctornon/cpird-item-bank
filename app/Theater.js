"use client";
import { useEffect, useState, useCallback } from "react";
import { STATUS_TH } from "../lib/constants";
import ItemEditor from "./ItemEditor";
export default function Theater({ sb, bp, me, notify }) {
const [pool, setPool] = useState([]);
const [idx, setIdx] = useState(0);
const [filter, setFilter] = useState({ status: "review", domain: "" });
const [ver, setVer] = useState(null);
const [options, setOptions] = useState([]);
const [reviews, setReviews] = useState([]);
const [names, setNames] = useState({});
const [myScore, setMyScore] = useState("");
const [myComment, setMyComment] = useState("");
const [busy, setBusy] = useState(false);
const [editing, setEditing] = useState(null);
const loadPool = useCallback(async () => {
let q = sb.from("bank_items").select("*").order("updated_at", { ascending: false }).limit(500);
if (filter.status) q = q.eq("status", filter.status);
if (filter.domain) q = q.eq("nl_domain_code", filter.domain);
const { data } = await q;
setPool(data || []); setIdx(0);
}, [sb, filter]);
useEffect(() => { loadPool(); }, [loadPool]);
const item = pool[idx];
const loadDetail = useCallback(async () => {
if (!item) { setVer(null); setOptions([]); setReviews([]); return; }
if (item.current_version_id) {
const { data: v } = await sb.from("bank_item_versions").select("*").eq("id", item.current_version_id).maybeSingle();
setVer(v || null);
if (item.type === "mcq") {
const { data: o } = await sb.from("bank_item_options").select("*").eq("version_id", item.current_version_id).order("order_index");
setOptions(o || []);
} else setOptions([]);
}
const { data: rv } = await sb.from("item_reviews").select("*").eq("item_id", item.id);
const list = rv || []; setReviews(list);
const mine = list.find((r) => r.reviewer_id === me);
setMyScore(mine?.ai_score != null ? String(mine.ai_score) : "");
setMyComment(mine?.comment || "");
const ids = [...new Set(list.map((r) => r.reviewer_id))];
if (ids.length) {
const { data: ns } = await sb.rpc("profile_names", { _ids: ids });
const m = {}; (ns || []).forEach((n) => { m[n.id] = n.full_name || n.email; }); setNames(m);
}
}, [item, sb, me]);
useEffect(() => { loadDetail(); }, [loadDetail]);
const submit = async () => {
if (!item || myScore === "") return notify("กรุณาใส่คะแนน AI (0–1)");
setBusy(true);
const { error } = await sb.from("item_reviews").upsert(
{ item_id: item.id, reviewer_id: me, ai_score: Number(myScore), comment: myComment || null, updated_at: new Date().toISOString() },
{ onConflict: "item_id,reviewer_id" });
setBusy(false);
if (error) return notify("ผิดพลาด: " + error.message);
notify("บันทึกคะแนนแล้ว"); loadDetail();
};
const del = async () => {
if (!item) return;
if (!confirm("ลบข้อ #" + item.id + " ถาวร?\n(ถ้าอยู่ในชุดข้อสอบหรือเคยใช้สอบจริง จะลบไม่ได้)")) return;
setBusy(true);
const { error } = await sb.rpc("bank_delete_item", { _id: item.id });
setBusy(false);
if (error) return notify("ลบไม่ได้: " + error.message);
notify("ลบข้อ #" + item.id + " แล้ว"); loadPool();
};
const sendRevise = async () => {
if (!item) return;
const note = prompt("ข้อความถึงผู้ออกข้อสอบ (สิ่งที่ต้องแก้ไข):", myComment || "");
if (note === null) return;
setBusy(true);
const { error } = await sb.from("bank_items").update({ status: "draft", updated_at: new Date().toISOString() }).eq("id", item.id);
if (error) { setBusy(false); return notify("ผิดพลาด: " + error.message); }
if (item.author_id) await sb.from("item_notifications").insert({ recipient_id: item.author_id, item_id: item.id, kind: "revise", message: note || "ขอให้แก้ไขข้อสอบ", from_id: me });
setBusy(false);
notify(item.author_id ? "ส่งกลับให้ผู้ออกข้อสอบแก้ไข + แจ้งเตือนแล้ว" : "ส่งกลับเป็นร่างแล้ว (ข้อนี้ไม่มีผู้ออกข้อสอบระบุไว้ จึงไม่ได้แจ้งเตือน)");
loadPool();
};
const avg = reviews.length ? (reviews.reduce((s, r) => s + (Number(r.ai_score) || 0), 0) / reviews.length) : null;
const domainTitle = item ? (bp.domains.find((d) => d.code === item.nl_domain_code)?.title || item.nl_domain_code || "—") : "";
const specName = item ? (bp.specs.find((s) => s.id === item.specialty_id)?.name_th || "—") : "";
return (
<div className="theater">
<div className="th-side">
<div className="row" style={{ gap: 6, marginBottom: 10 }}>
<select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
<option value="">ทุกสถานะ</option><option value="draft">ร่าง</option><option value="review">รอทบทวน</option><option value="approved">อนุมัติ</option>
</select>
<select value={filter.domain} onChange={(e) => setFilter({ ...filter, domain: e.target.value })}>
<option value="">ทุกหมวด</option>{bp.domains.map((d) => <option key={d.code} value={d.code}>{d.code}</option>)}
</select>
</div>
<div className="muted" style={{ marginBottom: 6 }}>{pool.length} ข้อ</div>
<div className="th-list">
{pool.map((it, i) => (
<button key={it.id} className={"th-li" + (i === idx ? " active" : "")} onClick={() => setIdx(i)}>
<span className="th-num">{i + 1}</span>
<span className="th-txt">#{it.id} · {it.nl_domain_code || "—"} {(it.nl_subitem || "").slice(0, 18)}</span>
</button>
))}
</div>
</div>
<div className="th-stage">
{!item ? <div className="empty">ไม่มีข้อสอบในเงื่อนไขนี้</div> : (
<>
<div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
<div className="muted"><b style={{ color: "var(--accent)" }}>#{item.id}</b> · ข้อ {idx + 1} / {pool.length} · <span className={"pill " + item.type}>{item.type.toUpperCase()}</span> <span className={"pill " + item.status}>{STATUS_TH[item.status]}</span></div>
<div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
<button className="btn ghost sm" disabled={busy} onClick={() => setEditing(item)}>✎ แก้ไข</button>
<button className="btn ghost sm" style={{ color: "var(--warn, #b26a00)" }} disabled={busy} onClick={sendRevise}>↩ ส่งแก้</button>
<button className="btn ghost sm" style={{ color: "var(--stop)" }} disabled={busy} onClick={del}>🗑 ลบ</button>
<button className="btn ghost sm" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>‹ ก่อนหน้า</button>
<button className="btn ghost sm" disabled={idx >= pool.length - 1} onClick={() => setIdx(idx + 1)}>ถัดไป ›</button>
</div>
</div>
<div className="muted" style={{ margin: "6px 0 14px" }}>{domainTitle}{item.nl_subitem ? " → " + item.nl_subitem : ""} · {specName}</div>
<div className="th-stem">{ver?.stem || "—"}</div>
{item.type === "mcq" ? options.map((o) => (
<div key={o.id} className={"pv-opt" + (o.is_correct ? " correct" : "")}>
<span className="lb">{o.label}</span>
<div style={{ flex: 1 }}>{o.body}{o.is_correct && <span className="pv-badge">เฉลย</span>}
{ver?.rationale_mode === "per_option" && o.rationale && <div className="pv-orat">{o.rationale}</div>}</div>
</div>
)) : <div className="pv-block"><span className="mk">แนวคำตอบ</span>{ver?.meq_model_answer || "—"}</div>}
{ver?.rationale_mode !== "per_option" && ver?.rationale && <div className="pv-block"><span className="mk">เฉลยอธิบาย</span>{ver.rationale}</div>}
<div className="th-score">
<div className="row" style={{ alignItems: "end", gap: 12 }}>
<div style={{ width: 150 }}><label>คะแนน AI ของฉัน (0–1)</label>
<input type="number" min="0" max="1" step="0.05" value={myScore} onChange={(e) => setMyScore(e.target.value)} placeholder="เช่น 0.65" /></div>
<div style={{ flex: 1 }}><label>ความเห็น (ถ้ามี)</label>
<input value={myComment} onChange={(e) => setMyComment(e.target.value)} placeholder="ข้อเสนอแนะต่อข้อสอบ" /></div>
<button className="btn" onClick={submit} disabled={busy}>{busy ? "…" : "ให้คะแนน"}</button>
</div>
<div className="th-avg">
{avg != null ? <><span className="pv-big">{avg.toFixed(2)}</span> <span className="muted">เฉลี่ยจากกรรมการ {reviews.length} คน · MPL ≈ {(avg * 100).toFixed(0)}%</span></> : <span className="muted">ยังไม่มีกรรมการให้คะแนน</span>}
</div>
{reviews.length > 0 && <table style={{ marginTop: 8 }}><thead><tr><th>กรรมการ</th><th>คะแนน AI</th><th>ความเห็น</th></tr></thead>
<tbody>{reviews.map((r) => <tr key={r.id}><td>{names[r.reviewer_id] || r.reviewer_id.slice(0, 8)}{r.reviewer_id === me ? " (ฉัน)" : ""}</td><td>{r.ai_score}</td><td className="muted">{r.comment || "—"}</td></tr>)}</tbody></table>}
</div>
</>
)}
</div>
{editing && <ItemEditor sb={sb} bp={bp} item={editing} canApprove notify={notify} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); loadPool(); }} />}
</div>
);
}
