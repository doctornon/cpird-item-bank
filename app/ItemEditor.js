"use client";
import { useEffect, useState, useRef } from "react";
import { BLOOM, DIFF, OPT_LABELS, STATUS_TH } from "../lib/constants";
import { ICD_SYSTEMS } from "../lib/tos.mjs";
function vpayload(form, itemId, versionNo) {
const p = { stem: form.stem, rationale: form.rationale_mode === "per_option" ? null : (form.rationale || null), rationale_mode: form.rationale_mode, stem_images: form.stemImages || [] };
if (versionNo) { p.item_id = itemId; p.version_no = versionNo; }
if (form.type === "meq") { p.meq_model_answer = form.meq_model_answer || null; p.meq_max_score = form.meq_max_score ? Number(form.meq_max_score) : null; }
return p;
}
export default function ItemEditor({ sb, bp, item, canApprove, onClose, onSaved, notify, previewOnly = false, previewNotice = "", initialType = "mcq", createStatus = null }) {
const [form, setForm] = useState({
type: item?.type || initialType,
nl_domain_code: item?.nl_domain_code || "",
nl_subitem: item?.nl_subitem || "",
physician_task: item?.physician_task || "",
specialty_id: item?.specialty_id ? String(item.specialty_id) : "",
icd_system: item?.icd_system ? String(item.icd_system) : "",
nl_group: item?.nl_group ? String(item.nl_group) : "",
bloom_level: item?.bloom_level || "",
difficulty_target: item?.difficulty_target || "",
exam_year: item?.exam_year ?? "",
stem: "", rationale: "", rationale_mode: "combined", meq_model_answer: "", meq_max_score: "",
stemImages: [],
status: item?.status || "draft",
});
const [options, setOptions] = useState([
{ label: "A", body: "", is_correct: true, rationale: "" }, { label: "B", body: "", is_correct: false, rationale: "" },
{ label: "C", body: "", is_correct: false, rationale: "" }, { label: "D", body: "", is_correct: false, rationale: "" },
{ label: "E", body: "", is_correct: false, rationale: "" },
]);
const [busy, setBusy] = useState(false);
const [dirty, setDirty] = useState(false);
const [confirmClose, setConfirmClose] = useState(false);
const [loading, setLoading] = useState(!!item?.current_version_id);
const [loadError, setLoadError] = useState(false);
const dialogRef = useRef(null);
const continueRef = useRef(null);
const requestClose = () => { if (busy) return; if (dirty) setConfirmClose(true); else onClose(); };
useEffect(() => {
const previous = document.activeElement;
const overflow = document.body.style.overflow;
document.body.style.overflow = "hidden";
dialogRef.current?.focus();
return () => { document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
}, []);
useEffect(() => { if (confirmClose) continueRef.current?.focus(); }, [confirmClose]);
useEffect(() => {
if (!dirty) return;
const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
window.addEventListener("beforeunload", warn);
return () => window.removeEventListener("beforeunload", warn);
}, [dirty]);
const handleKey = (e) => {
if (e.key === "Escape") { e.preventDefault(); if (confirmClose) { setConfirmClose(false); dialogRef.current?.focus(); } else requestClose(); }
if (e.key !== "Tab") return;
const focusable = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length);
const first = focusable[0], last = focusable[focusable.length - 1];
if (!first) { e.preventDefault(); return; }
if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { e.preventDefault(); last.focus(); }
else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { e.preventDefault(); first.focus(); }
};
useEffect(() => {
if (!item?.current_version_id) return;
(async () => {
try {
const { data: v, error: versionError } = await sb.from("bank_item_versions").select("*").eq("id", item.current_version_id).maybeSingle();
if (versionError || !v) throw new Error("load");
if (v) setForm((s) => ({ ...s, stem: v.stem || "", rationale: v.rationale || "", rationale_mode: v.rationale_mode || "combined", meq_model_answer: v.meq_model_answer || "", meq_max_score: v.meq_max_score ?? "", stemImages: Array.isArray(v.stem_images) ? v.stem_images : [] }));
if (item.type === "mcq") {
const { data: o, error: optionsError } = await sb.from("bank_item_options").select("*").eq("version_id", item.current_version_id).order("order_index");
if (optionsError) throw optionsError;
if (o && o.length) setOptions(o.map((x) => ({ label: x.label, body: x.body, is_correct: x.is_correct, rationale: x.rationale || "", image_url: x.image_url || null, image_width: x.image_width || null })));
}
} catch { setLoadError(true); } finally { setLoading(false); }
})();
}, [item, sb]);
const subOpts = bp.subitems.filter((s) => s.domain_code === form.nl_domain_code);
const set = (k, v) => setForm({ ...form, [k]: v });
const setOpt = (i, k, v) => setOptions(options.map((o, idx) => idx === i ? { ...o, [k]: v } : (k === "is_correct" ? { ...o, is_correct: false } : o)));
const uploadImage = async (file) => { if (!file) return null; const ext = (file.name.split(".").pop() || "png").toLowerCase(); const path = `items/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`; const { error } = await sb.storage.from("question-images").upload(path, file); if (error) { notify("อัปโหลดรูปไม่สำเร็จ: " + error.message); return null; } return sb.storage.from("question-images").getPublicUrl(path).data.publicUrl; };
const addStemImage = async (file) => { const url = await uploadImage(file); if (url) { setDirty(true); setForm((f) => ({ ...f, stemImages: [...(f.stemImages || []), { url, align: "center", width: 60 }] })); } };
const updStemImage = (i, k, v) => { setDirty(true); setForm((f) => ({ ...f, stemImages: (f.stemImages || []).map((im, j) => j === i ? { ...im, [k]: v } : im) })); };
const rmStemImage = (i) => { setDirty(true); setForm((f) => ({ ...f, stemImages: (f.stemImages || []).filter((_, j) => j !== i) })); };
const setOptImage = async (i, file) => { const url = await uploadImage(file); if (url) { setDirty(true); setOptions((os) => os.map((o, j) => j === i ? { ...o, image_url: url, image_width: o.image_width || 50 } : o)); } };
const updOpt = (i, k, v) => { setDirty(true); setOptions((os) => os.map((o, j) => j === i ? { ...o, [k]: v } : o)); };
const save = async () => {
if (previewOnly || busy || loading || loadError) return;
if (!form.stem.trim()) return notify("กรุณากรอกโจทย์");
setBusy(true);
try {
const meta = {
type: form.type, nl_domain_code: form.nl_domain_code || null, nl_subitem: form.nl_subitem || null,
physician_task: form.physician_task || null, specialty_id: form.specialty_id ? Number(form.specialty_id) : null,
icd_system: form.icd_system ? Number(form.icd_system) : null, nl_group: form.nl_group ? Number(form.nl_group) : null,
bloom_level: form.bloom_level || null, difficulty_target: form.difficulty_target || null,
exam_year: form.exam_year ? Number(form.exam_year) : null,
...(createStatus && !item?.id ? { status: createStatus } : {}),
};
let itemId = item?.id, versionId = item?.current_version_id;
if (!itemId) {
const { data: ni, error: e1 } = await sb.from("bank_items").insert(meta).select("id").single();
if (e1) throw e1; itemId = ni.id;
const { data: nv, error: e2 } = await sb.from("bank_item_versions").insert(vpayload(form, itemId, 1)).select("id").single();
if (e2) throw e2; versionId = nv.id;
await sb.from("bank_items").update({ current_version_id: versionId, updated_at: new Date().toISOString() }).eq("id", itemId);
} else {
const { error: e1 } = await sb.from("bank_items").update({ ...meta, updated_at: new Date().toISOString() }).eq("id", itemId);
if (e1) throw e1;
const { error: e2 } = await sb.from("bank_item_versions").update(vpayload(form, itemId, null)).eq("id", versionId);
if (e2) throw e2;
}
if (form.type === "mcq") {
await sb.from("bank_item_options").delete().eq("version_id", versionId);
const rows = options.filter((o) => o.body.trim() || o.image_url).map((o, i) => ({ version_id: versionId, label: o.label, body: o.body, is_correct: !!o.is_correct, rationale: o.rationale || null, order_index: i, image_url: o.image_url || null, image_width: o.image_url ? (o.image_width || 50) : null }));
if (rows.length) { const { error: e3 } = await sb.from("bank_item_options").insert(rows); if (e3) throw e3; }
}
notify("บันทึกแล้ว"); onSaved();
} catch (err) { notify("ผิดพลาด: " + (err.message || err)); } finally { setBusy(false); }
};
const setStatus = async (st) => {
if (!item?.id || busy || dirty || loading || loadError) return;
setBusy(true);
try {
const { error } = await sb.from("bank_items").update({ status: st, updated_at: new Date().toISOString() }).eq("id", item.id);
if (error) return notify("ผิดพลาด: " + error.message);
notify("เปลี่ยนสถานะเป็น " + STATUS_TH[st]); onSaved();
} catch { notify("เปลี่ยนสถานะไม่สำเร็จ กรุณาลองอีกครั้ง"); } finally { setBusy(false); }
};
const perOption = form.rationale_mode === "per_option";
return (
<div className="overlay" onClick={(e) => e.target === e.currentTarget && requestClose()}>
<div className="modal editor-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title" tabIndex={-1} ref={dialogRef} onKeyDown={handleKey}>
<div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
<h3 id="editor-title">{item ? "แก้ไขข้อสอบ" : "สร้างข้อสอบใหม่"}</h3>
<button className="btn ghost sm" disabled={busy} onClick={requestClose}>ปิด</button>
</div>
{previewNotice && <div className="editor-confirm" role="note">{previewNotice}</div>}
{item?.is_sample && <div className="editor-confirm" role="note">🧪 <strong>ข้อสอบตัวอย่าง ศรว.</strong> — ใช้จัดสอบจริงไม่ได้ (เปิดได้เฉพาะรอบ "ตัวอย่างห้องทดสอบ") · แก้ไขได้ และใช้ปุ่ม "ทำซ้ำ/ออกคู่ขนาน" เพื่อสร้างข้อจริงจากข้อนี้ · เฉลยเบื้องต้นยังไม่ผ่านการตรวจสอบจากกรรมการ</div>}
<p className="editor-status" role="status">{loading ? "กำลังโหลดข้อสอบ…" : loadError ? "โหลดข้อสอบไม่สำเร็จ กรุณาปิดแล้วลองเปิดใหม่" : dirty ? "มีการแก้ไขที่ยังไม่ได้บันทึก" : "แก้ไขข้อมูลแล้วกดบันทึกเมื่อพร้อม"}</p>
{confirmClose && <div className="editor-confirm" role="alert"><strong>ยังไม่ได้บันทึกการแก้ไข</strong><p>หากปิดตอนนี้ ข้อความที่แก้ไขจะหายไป</p><div className="row"><button ref={continueRef} className="btn" onClick={() => { setConfirmClose(false); dialogRef.current?.focus(); }}>กลับไปเขียนต่อ</button><button className="btn ghost" onClick={onClose}>ทิ้งการแก้ไขและปิด</button></div></div>}
<fieldset disabled={busy || loading || loadError || confirmClose} className="editor-fields" onChangeCapture={() => setDirty(true)}>
<div className="field"><label htmlFor="editor-field-1">ชนิด</label>
<select id="editor-field-1" value={form.type} onChange={(e) => set("type", e.target.value)} disabled={!!item || !!initialType}>
<option value="mcq">MCQ</option><option value="meq">MEQ</option>
</select></div>
<div className="grid2">
<div className="field"><label htmlFor="editor-field-2">หมวด (I–IV)</label>
<select id="editor-field-2" value={form.nl_domain_code} onChange={(e) => setForm({ ...form, nl_domain_code: e.target.value, nl_subitem: "" })}>
<option value="">— เลือก —</option>{bp.domains.map((d) => <option key={d.code} value={d.code}>{d.title}</option>)}
</select></div>
<div className="field"><label htmlFor="editor-field-3">หัวข้อย่อย</label>
<select id="editor-field-3" value={form.nl_subitem} onChange={(e) => set("nl_subitem", e.target.value)} disabled={!form.nl_domain_code}>
<option value="">— เลือก —</option>{subOpts.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
</select></div>
</div>
<div className="grid2">
<div className="field"><label htmlFor="editor-field-4">ภารกิจแพทย์</label>
<select id="editor-field-4" value={form.physician_task} onChange={(e) => set("physician_task", e.target.value)}>
<option value="">— เลือก —</option>{bp.tasks.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
</select></div>
<div className="field"><label htmlFor="editor-field-5">สาขา</label>
<select id="editor-field-5" value={form.specialty_id} onChange={(e) => set("specialty_id", e.target.value)}>
<option value="">— เลือก —</option>{bp.specs.map((s) => <option key={s.id} value={String(s.id)}>{s.name_th}</option>)}
</select></div>
</div>
<div className="grid2">
<div className="field"><label htmlFor="editor-field-icd">ระบบโรค (ICD) — ตาม Table of Spec</label>
<select id="editor-field-icd" value={form.icd_system} onChange={(e) => set("icd_system", e.target.value)}>
<option value="">— เลือก / ไม่ระบุ (หมวด1 ทั่วไป) —</option>{ICD_SYSTEMS.map((s) => <option key={s.code} value={String(s.code)}>{s.roman}. {s.th}</option>)}
</select></div>
<div className="field"><label htmlFor="editor-field-grp">กลุ่ม (1 ฉุกเฉิน / 2 / 3)</label>
<select id="editor-field-grp" value={form.nl_group} onChange={(e) => set("nl_group", e.target.value)}>
<option value="">— เลือก / ยังไม่ระบุ —</option><option value="1">กลุ่ม 1 (ฉุกเฉิน)</option><option value="2">กลุ่ม 2</option><option value="3">กลุ่ม 3</option>
</select></div>
</div>
<div className="grid2">
<div className="field"><label htmlFor="editor-field-6">Bloom</label><select id="editor-field-6" value={form.bloom_level} onChange={(e) => set("bloom_level", e.target.value)}><option value="">—</option>{BLOOM.map((b) => <option key={b} value={b}>{b}</option>)}</select></div>
<div className="field"><label htmlFor="editor-field-7">ความยาก</label><select id="editor-field-7" value={form.difficulty_target} onChange={(e) => set("difficulty_target", e.target.value)}><option value="">—</option>{DIFF.map((d) => <option key={d} value={d}>{d}</option>)}</select></div>
</div>
<div className="field"><label htmlFor="editor-field-8">ปีการศึกษา (พ.ศ.) — สำหรับคลังแยกปี</label><input id="editor-field-8" type="number" value={form.exam_year} onChange={(e) => set("exam_year", e.target.value)} placeholder="เช่น 2568 (เว้นว่างได้)" /></div>
<div className="field"><label htmlFor="editor-field-9">โจทย์ (stem)</label><textarea id="editor-field-9" value={form.stem} onChange={(e) => set("stem", e.target.value)} /></div>
<div className="field"><label>รูปภาพประกอบโจทย์ (แนบได้หลายรูป)</label>
<input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) addStemImage(f); e.target.value = ""; }} />
{(form.stemImages || []).map((im, i) => (
<div key={i} className="qimg-edit">
<img src={im.url} alt="" style={{ width: 90, height: 60, objectFit: "cover", borderRadius: 6 }} />
<select value={im.align || "center"} onChange={(e) => updStemImage(i, "align", e.target.value)}><option value="left">ชิดซ้าย</option><option value="center">กึ่งกลาง</option><option value="right">ชิดขวา</option></select>
<label className="mk" style={{ margin: 0, display: "flex", alignItems: "center", gap: 4 }}>กว้าง %<input type="number" min="10" max="100" step="5" style={{ width: 70 }} value={im.width || 60} onChange={(e) => updStemImage(i, "width", Number(e.target.value))} /></label>
<button type="button" className="btn ghost sm" style={{ color: "var(--stop)" }} onClick={() => rmStemImage(i)}>ลบรูป</button>
</div>
))}
</div>
{form.type === "mcq" ? (
<>
<div className="field"><label htmlFor="editor-field-10">โหมดเฉลย/คำอธิบาย</label>
<select id="editor-field-10" value={form.rationale_mode} onChange={(e) => set("rationale_mode", e.target.value)}>
<option value="combined">รวม (อธิบายก้อนเดียว)</option>
<option value="per_option">แยกรายตัวเลือก (อธิบายเหตุผลถูก-ผิดแต่ละข้อ)</option>
</select></div>
<div className="field"><label>ตัวเลือก (เลือกวงกลม = คำตอบที่ถูก)</label>
{options.map((o, i) => (
<div key={i} style={{ marginBottom: perOption ? 10 : 4 }}>
<div className="opt">
<input aria-label={"คำตอบที่ถูก: ตัวเลือก " + o.label} type="radio" name="correct" checked={!!o.is_correct} onChange={() => setOpt(i, "is_correct", true)} />
<span className="lb">{o.label}</span>
<input aria-label={"ข้อความตัวเลือก " + o.label} value={o.body} onChange={(e) => setOpt(i, "body", e.target.value)} placeholder={"ตัวเลือก " + o.label} />
</div>
{perOption && <input aria-label={"เหตุผลตัวเลือก " + o.label} style={{ marginTop: 4, marginLeft: 34, width: "calc(100% - 34px)" }} value={o.rationale} onChange={(e) => setOpt(i, "rationale", e.target.value)} placeholder={"เหตุผล " + o.label + " (ถูก/ผิดเพราะ…)"} />}
<div className="opt-img-row" style={{ marginLeft: 34 }}>
<input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) setOptImage(i, f); e.target.value = ""; }} />
{o.image_url && <><img src={o.image_url} alt="" style={{ width: 70, height: 46, objectFit: "cover", borderRadius: 4 }} /><label className="mk" style={{ margin: 0, display: "flex", alignItems: "center", gap: 4 }}>กว้าง %<input type="number" min="10" max="100" step="5" style={{ width: 64 }} value={o.image_width || 50} onChange={(e) => updOpt(i, "image_width", Number(e.target.value))} /></label><button type="button" className="btn ghost sm" style={{ color: "var(--stop)" }} onClick={() => updOpt(i, "image_url", null)}>ลบรูป</button></>}
</div>
</div>
))}
<div className="row" style={{ marginTop: 6 }}>
{options.length < 5 && <button className="btn ghost sm" onClick={() => { setDirty(true); setOptions([...options, { label: OPT_LABELS[options.length], body: "", is_correct: false, rationale: "" }]); }}>+ ตัวเลือก</button>}
{options.length > 2 && <button className="btn ghost sm" onClick={() => { setDirty(true); setOptions(options.slice(0, -1)); }}>ลบตัวเลือกท้าย</button>}
</div>
</div>
{!perOption && <div className="field"><label htmlFor="editor-field-11">เฉลยอธิบาย (รวม)</label><textarea id="editor-field-11" value={form.rationale} onChange={(e) => set("rationale", e.target.value)} /></div>}
</>
) : (
<>
<div className="grid2">
<div className="field"><label htmlFor="editor-field-12">แนวคำตอบ (model answer / เฉลย)</label><textarea id="editor-field-12" value={form.meq_model_answer} onChange={(e) => set("meq_model_answer", e.target.value)} /></div>
<div className="field"><label htmlFor="editor-field-13">คะแนนเต็ม</label><input id="editor-field-13" type="number" value={form.meq_max_score} onChange={(e) => set("meq_max_score", e.target.value)} /></div>
</div>
<div className="field"><label htmlFor="editor-field-14">เฉลยอธิบาย</label><textarea id="editor-field-14" value={form.rationale} onChange={(e) => set("rationale", e.target.value)} /></div>
</>
)}
{dirty && item && canApprove && <p className="editor-status">บันทึกการแก้ไขก่อนเปลี่ยนสถานะข้อสอบ</p>}
<div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
<div className="row">
{item && canApprove && form.status !== "approved" && <button className="btn sm" style={{ background: "var(--good)" }} disabled={dirty || busy} onClick={() => setStatus("approved")}>อนุมัติ</button>}
{item && canApprove && form.status !== "review" && <button className="btn ghost sm" disabled={dirty || busy} onClick={() => setStatus("review")}>ส่งทบทวน</button>}
{item && canApprove && form.status !== "retired" && <button className="btn ghost sm" disabled={dirty || busy} onClick={() => setStatus("retired")}>ปลด</button>}
</div>
<div className="row" style={{ gap: 8 }}><button type="button" className="btn ghost" disabled={busy} onClick={requestClose}>ยกเลิก</button><button className="btn" onClick={save} disabled={busy || previewOnly}>{busy ? "กำลังบันทึก…" : "บันทึก"}</button></div>
</div>
</fieldset>
</div>
</div>
);
}
