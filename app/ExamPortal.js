"use client";
import { useEffect, useState, useCallback, useRef } from "react";
function fmt(s) {
if (s == null) return "—";
if (s < 0) s = 0;
const m = Math.floor(s / 60), ss = s % 60;
return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
function PortalTop({ profile, onSignOut }) {
return (
<div className="topbar"><div className="wrap in">
<span className="brand">ระบบจัดทดสอบและวัดผล สพพ. · สอบออนไลน์</span>
<span className="grow" />
<span className="who">{profile?.full_name || profile?.email}<br /><span className="muted">นักศึกษา</span></span>
<button className="btn ghost sm" onClick={onSignOut}>ออก</button>
</div></div>
);
}
export default function ExamPortal({ sb, profile, notify, onSignOut }) {
const [view, setView] = useState("list");
const [list, setList] = useState([]);
const [loading, setLoading] = useState(true);
const [attemptId, setAttemptId] = useState(null);
const [paper, setPaper] = useState(null);
const [answers, setAnswers] = useState({});
const [idx, setIdx] = useState(0);
const [remaining, setRemaining] = useState(null);
const [result, setResult] = useState(null);
const [busy, setBusy] = useState(false);
const [pending, setPending] = useState(0);
const [lastSync, setLastSync] = useState(null);
const submittingRef = useRef(false);
const answersRef = useRef({});
const dirtyRef = useRef(new Set());
useEffect(() => { answersRef.current = answers; }, [answers]);
const lsKey = (aid) => "exam_ans_" + aid;
const flush = useCallback(async () => {
if (!attemptId) return;
const ids = [...dirtyRef.current];
for (const id of ids) {
const a = answersRef.current[id] || {};
const { error } = await sb.rpc("exam_save_answer", { _attempt_id: attemptId, _item_id: Number(id), _label: a.selected_label || null, _essay: a.essay_text || null });
if (!error) dirtyRef.current.delete(id);
}
setPending(dirtyRef.current.size);
if (dirtyRef.current.size === 0) setLastSync(Date.now());
}, [sb, attemptId]);
const loadList = useCallback(async () => {
setLoading(true);
const { data } = await sb.rpc("exam_my_list");
setList(data || []); setLoading(false);
}, [sb]);
useEffect(() => { loadList(); }, [loadList]);
// autosave pending answers to server every 10s while taking the exam
useEffect(() => {
if (view !== "exam") return;
const iv = setInterval(() => { flush(); }, 10000);
return () => { clearInterval(iv); flush(); };
}, [view, flush]);
// log tab-switch / focus loss (soft signal only)
useEffect(() => {
if (view !== "exam" || !attemptId) return;
const onHide = () => { if (document.hidden) { sb.rpc("exam_log_blur", { _attempt_id: attemptId }); } };
document.addEventListener("visibilitychange", onHide);
return () => document.removeEventListener("visibilitychange", onHide);
}, [view, attemptId, sb]);
const doSubmit = useCallback(async (auto = false) => {
if (submittingRef.current) return;
if (!auto && !confirm("ยืนยันส่งข้อสอบ? หลังส่งจะแก้ไขคำตอบไม่ได้")) return;
submittingRef.current = true; setBusy(true);
await flush();
const { error } = await sb.rpc("exam_submit", { _attempt_id: attemptId });
if (error && !auto) { setBusy(false); submittingRef.current = false; return notify("ส่งไม่สำเร็จ: " + error.message); }
try { localStorage.removeItem(lsKey(attemptId)); } catch (e) {}
const { data: r } = await sb.rpc("exam_result", { _attempt_id: attemptId });
setBusy(false); submittingRef.current = false;
setResult(r); setView("result");
if (auto) notify("หมดเวลา — ระบบส่งข้อสอบให้อัตโนมัติ");
}, [sb, attemptId, notify, flush]);
// countdown timer
useEffect(() => {
if (view !== "exam" || !paper?.attempt?.expires_at) return;
const exp = new Date(paper.attempt.expires_at).getTime();
let iv;
const tick = () => {
const s = Math.round((exp - Date.now()) / 1000);
setRemaining(s);
if (s <= 0) { clearInterval(iv); doSubmit(true); }
};
tick(); iv = setInterval(tick, 1000);
return () => clearInterval(iv);
}, [view, paper, doSubmit]);
const start = async (a) => {
let code = null;
if (a.access_required) { code = prompt("กรอกรหัสเข้าสอบ"); if (code === null) return; }
setBusy(true);
const { data: aid, error } = await sb.rpc("exam_start", { _assignment_id: a.assignment_id, _access_code: code });
if (error) { setBusy(false); return notify("เข้าสอบไม่ได้: " + error.message); }
const { data: p, error: e2 } = await sb.rpc("exam_paper", { _attempt_id: aid });
setBusy(false);
if (e2) return notify("โหลดข้อสอบไม่ได้: " + e2.message);
const am = {}; (p.questions || []).forEach((q) => { if (q.answer) am[q.item_id] = { selected_label: q.answer.selected_label, essay_text: q.answer.essay_text }; });
dirtyRef.current = new Set();
try { const raw = localStorage.getItem(lsKey(aid)); if (raw) { const local = JSON.parse(raw) || {}; Object.keys(local).forEach((k) => { am[k] = { ...(am[k] || {}), ...local[k] }; dirtyRef.current.add(k); }); } } catch (e) {}
setAttemptId(aid); setPaper(p); setAnswers(am); answersRef.current = am; setIdx(0); setView("exam");
if (dirtyRef.current.size) setTimeout(() => flush(), 500);
};
const saveAnswer = (item_id, patch) => {
setAnswers((prev) => {
const cur = { ...(prev[item_id] || {}), ...patch };
const next = { ...prev, [item_id]: cur };
answersRef.current = next;
try { if (attemptId) localStorage.setItem(lsKey(attemptId), JSON.stringify(next)); } catch (e) {}
return next;
});
dirtyRef.current.add(item_id);
setPending(dirtyRef.current.size);
};
const viewResult = async (aid) => {
const { data, error } = await sb.rpc("exam_result", { _attempt_id: aid });
if (error) return notify("ดูผลไม่ได้: " + error.message);
setAttemptId(aid); setResult(data); setView("result");
};
const backToList = () => { setView("list"); setPaper(null); setResult(null); setAttemptId(null); loadList(); };
// ---------- LIST ----------
if (view === "list") {
return (
<>
<PortalTop profile={profile} onSignOut={onSignOut} />
<div className="wrap section">
<h2 style={{ marginBottom: 4 }}>ข้อสอบของฉัน</h2>
<p className="muted" style={{ marginBottom: 18 }}>รายการสอบที่เปิดให้คุณเข้าทำ</p>
{loading ? <div className="empty">กำลังโหลด…</div> :
list.length === 0 ? <div className="card"><div className="empty">ยังไม่มีข้อสอบที่เปิดให้เข้าทำในขณะนี้</div></div> : (
<div className="row" style={{ flexDirection: "column", gap: 12 }}>
{list.map((a) => {
const done = (a.attempts || []).filter((t) => t.status !== "in_progress").length;
const inprog = (a.attempts || []).find((t) => t.status === "in_progress");
const best = (a.attempts || []).filter((t) => t.percent != null).reduce((m, t) => Math.max(m, Number(t.percent)), null);
const canTake = inprog || done < a.attempts_allowed;
return (
<div key={a.assignment_id} className="card" style={{ width: "100%" }}>
<div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
<div>
<h3>{a.title}</h3>
<div className="muted" style={{ marginTop: 4 }}>{a.set_title} · {a.qcount} ข้อ · {a.duration_min} นาที · ทำได้ {a.attempts_allowed} ครั้ง{a.access_required ? " · ต้องใช้รหัส" : ""}</div>
<div className="muted" style={{ marginTop: 2 }}>
{a.open_at ? "เปิด " + new Date(a.open_at).toLocaleString("th-TH") : ""}{a.close_at ? " · ปิด " + new Date(a.close_at).toLocaleString("th-TH") : ""}
</div>
</div>
<div style={{ textAlign: "right" }}>
{inprog ? <button className="btn" onClick={() => start(a)} disabled={busy}>ทำต่อ</button>
: canTake ? <button className="btn" onClick={() => start(a)} disabled={busy}>{done > 0 ? "สอบใหม่" : "เริ่มสอบ"}</button>
: <span className="muted">ครบจำนวนครั้งแล้ว</span>}
</div>
</div>
{(a.attempts || []).length > 0 && (
<div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
{a.attempts.map((t) => (
<button key={t.id} className="btn ghost sm" onClick={() => t.status !== "in_progress" && viewResult(t.id)}>
ครั้งที่ {t.attempt_no}: {t.status === "in_progress" ? "กำลังทำ" : (t.percent != null ? t.percent + "%" : "ส่งแล้ว")} {t.status !== "in_progress" ? "· ดูผล" : ""}
</button>
))}
{best != null && <span className="muted" style={{ alignSelf: "center" }}>คะแนนดีที่สุด {best}%</span>}
</div>
)}
</div>
);
})}
</div>
)}
</div>
</>
);
}
// ---------- EXAM ----------
if (view === "exam" && paper) {
const qs = paper.questions || [];
const q = qs[idx];
const answeredCount = qs.filter((x) => { const av = answers[x.item_id]; return av && (av.selected_label || (av.essay_text && av.essay_text.trim())); }).length;
const warn = remaining != null && remaining <= 300;
const wmText = profile?.student_id || profile?.email || profile?.full_name || "CPIRD";
const wmUri = "data:image/svg+xml;utf8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='340' height='200'><text x='10' y='100' transform='rotate(-18 170 100)' fill='rgba(120,130,140,0.15)' font-size='15' font-family='sans-serif'>" + wmText + "</text></svg>");
return (
<>
<div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 5, backgroundImage: "url(" + wmUri + ")", backgroundRepeat: "repeat" }} />
<div className="topbar"><div className="wrap in">
<span className="brand">ข้อสอบ</span>
<span className="grow" />
<span style={{ fontSize: 12, marginRight: 12, color: pending > 0 ? "var(--warn)" : "var(--good)" }}>{pending > 0 ? "💾 บันทึกในเครื่อง · รอส่ง " + pending : "☁️ ส่งเซิร์ฟเวอร์แล้ว" + (lastSync ? " " + new Date(lastSync).toLocaleTimeString("th-TH") : "")}</span>
<span className={"exam-timer" + (warn ? " warn" : "")}>⏱ {fmt(remaining)}</span>
<span className="muted" style={{ margin: "0 12px" }}>ตอบแล้ว {answeredCount}/{qs.length}</span>
<button className="btn" onClick={() => doSubmit(false)} disabled={busy}>ส่งข้อสอบ</button>
</div></div>
<div className="wrap section" style={{ userSelect: "none", WebkitUserSelect: "none", position: "relative", zIndex: 1 }} onCopy={(e) => e.preventDefault()} onCut={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()}>
<div className="theater">
<div className="th-side">
<div className="muted" style={{ marginBottom: 6 }}>ไปยังข้อ</div>
<div className="qgrid">
{qs.map((x, i) => {
const av = answers[x.item_id];
const ans = av && (av.selected_label || (av.essay_text && av.essay_text.trim()));
return <button key={x.item_id} className={"qbtn" + (i === idx ? " current" : "") + (ans ? " answered" : "")} onClick={() => setIdx(i)}>{i + 1}</button>;
})}
</div>
</div>
<div className="th-stage">
{!q ? <div className="empty">ไม่มีข้อสอบ</div> : (
<>
<div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
<div className="muted">ข้อ {idx + 1} / {qs.length} · <span className={"pill " + q.type}>{q.type.toUpperCase()}</span></div>
<div className="row" style={{ gap: 6 }}>
<button className="btn ghost sm" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>‹ ก่อนหน้า</button>
<button className="btn ghost sm" disabled={idx >= qs.length - 1} onClick={() => setIdx(idx + 1)}>ถัดไป ›</button>
</div>
</div>
<div className="th-stem">{q.stem}</div>
{q.type === "mcq" ? (
<div>
{(q.options || []).map((o) => {
const chosen = answers[q.item_id]?.selected_label === o.label;
return (
<label key={o.label} className={"pv-opt exam-opt" + (chosen ? " chosen" : "")} style={{ cursor: "pointer" }}>
<input type="radio" name={"q" + q.item_id} checked={chosen} onChange={() => saveAnswer(q.item_id, { selected_label: o.label })} style={{ width: "auto" }} />
<span className="lb">{o.label}</span>
<div style={{ flex: 1 }}>{o.body}</div>
</label>
);
})}
</div>
) : (
<div>
<label>คำตอบ (เขียนตอบ){q.meq_max_score != null ? " · เต็ม " + q.meq_max_score : ""}</label>
<textarea style={{ minHeight: 220 }} value={answers[q.item_id]?.essay_text || ""} onChange={(e) => saveAnswer(q.item_id, { essay_text: e.target.value })} placeholder="พิมพ์คำตอบ… (บันทึกอัตโนมัติทุก 10 วินาที)" />
<div className="muted" style={{ marginTop: 4 }}>ข้อเขียน (MEQ) จะให้อาจารย์ตรวจภายหลัง</div>
</div>
)}
<div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
{idx < qs.length - 1 ? <button className="btn" onClick={() => setIdx(idx + 1)}>ถัดไป ›</button>
: <button className="btn" style={{ background: "var(--good)" }} onClick={() => doSubmit(false)} disabled={busy}>ส่งข้อสอบ</button>}
</div>
</>
)}
</div>
</div>
</div>
</>
);
}
// ---------- RESULT ----------
if (view === "result" && result) {
const showScore = result.show_score !== false;
const showAns = result.show_answers !== false;
return (
<>
<PortalTop profile={profile} onSignOut={onSignOut} />
<div className="wrap section">
<button className="btn ghost sm" onClick={backToList} style={{ marginBottom: 14 }}>‹ กลับหน้ารายการสอบ</button>
{showScore && (
<div className="card" style={{ marginBottom: 16, textAlign: "center" }}>
<div className="pv-big" style={{ fontSize: 40, color: result.passed === false ? "var(--stop)" : "var(--good)" }}>{result.percent}%</div>
<div className="muted">คะแนน MCQ {result.score}/{result.max_score} · เกณฑ์ผ่าน {result.pass_mark}% · {result.passed == null ? "" : result.passed ? "ผ่าน ✓" : "ไม่ผ่าน"}</div>
<div className="muted" style={{ marginTop: 4 }}>ส่งเมื่อ {result.submitted_at ? new Date(result.submitted_at).toLocaleString("th-TH") : "—"}</div>
</div>
)}
{!showScore && <div className="card" style={{ marginBottom: 16 }}><div className="muted">ส่งข้อสอบเรียบร้อยแล้ว {showAns ? "· ดูเฉลยด้านล่าง" : ""}</div></div>}
{showAns ? (result.questions || []).map((q, i) => (
<div key={q.item_id} className="card" style={{ marginBottom: 12 }}>
<div className="row" style={{ justifyContent: "space-between" }}>
<div className="muted">ข้อ {i + 1} · <span className={"pill " + q.type}>{q.type.toUpperCase()}</span></div>
{q.type === "mcq" && (q.is_correct ? <span className="pill approved">ตอบถูก</span> : <span className="pill retired">ตอบผิด</span>)}
</div>
<div className="pv-stem" style={{ marginTop: 8 }}>{q.stem}</div>
{q.type === "mcq" ? (
<div>
{(q.options || []).map((o) => {
const chosen = q.selected === o.label;
const cls = "pv-opt" + (o.is_correct ? " correct" : "") + (chosen && !o.is_correct ? " wrong" : "");
return (
<div key={o.label} className={cls}>
<span className="lb">{o.label}</span>
<div style={{ flex: 1 }}>
<div>{o.body}{o.is_correct && <span className="pv-badge">เฉลย</span>}{chosen && <span className="pv-badge" style={{ background: "var(--ink-faint)" }}>คุณเลือก</span>}</div>
{q.rationale_mode === "per_option" && o.rationale && <div className="pv-orat">{o.rationale}</div>}
</div>
</div>
);
})}
{q.rationale_mode !== "per_option" && q.rationale && <div className="pv-block"><span className="mk">เฉลยอธิบาย</span>{q.rationale}</div>}
</div>
) : (
<div>
<div className="pv-block"><span className="mk">คำตอบของคุณ</span>{q.essay || "—"}</div>
{q.meq_model_answer && <div className="pv-block"><span className="mk">แนวคำตอบ (เฉลย)</span>{q.meq_model_answer}</div>}
</div>
)}
</div>
)) : <div className="card"><div className="muted">ไม่เปิดให้ดูเฉลยสำหรับการสอบนี้</div></div>}
</div>
</>
);
}
return <div className="wrap section"><div className="empty">กำลังโหลด…</div></div>;
}
