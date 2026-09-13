"use client";
import { useCallback, useEffect, useState } from "react";
const ST = { pending: ["รอพิจารณา", "draft"], appointed: ["ได้รับแต่งตั้งแล้ว", "approved"], rejected: ["ไม่ผ่านการพิจารณา", "retired"] };
const blank = (profile) => ({ full_name: profile?.full_name || "", position: "", affiliation: "", medical_center_id: "", specialties: "", phone: "", email: profile?.email || "", motivation: "" });
const REQUIRED = [["full_name", "ชื่อ-สกุล"], ["position", "ตำแหน่ง"], ["affiliation", "สังกัด/หน่วยงาน"], ["medical_center_id", "ศูนย์แพทย์"], ["specialties", "สาขาที่เชี่ยวชาญ"], ["phone", "โทรศัพท์"], ["email", "อีเมล"]];
const R = () => <span className="req" aria-hidden="true"> *</span>;

export default function WriterApplication({ sb, profile, notify }) {
  const [app, setApp] = useState(undefined); // undefined=loading, null=none
  const [form, setForm] = useState(null);
  const [centers, setCenters] = useState([]);
  const [specs, setSpecs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const [{ data: a }, { data: mc }, { data: sp }] = await Promise.all([
      sb.rpc("exam_writer_my"),
      sb.from("medical_centers").select("id,name_th,short_name").eq("is_active", true),
      sb.from("medical_specialties").select("name_th,name_en,display_order").order("display_order"),
    ]);
    setCenters((mc || []).sort((x, y) => ((y.short_name === "สพพ.") - (x.short_name === "สพพ.")) || (x.short_name || x.name_th).localeCompare(y.short_name || y.name_th, "th")));
    setSpecs(sp || []);
    setApp(a || null);
    if (!a) { setForm(blank(profile)); setEditing(true); }
  }, [sb, profile]);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    for (const [k, label] of REQUIRED) if (!String(form[k] || "").trim()) return notify("กรุณากรอก: " + label);
    setBusy(true);
    const { data, error } = await sb.rpc("exam_writer_apply", { _data: { ...form } });
    setBusy(false);
    if (error) return notify("บันทึกใบสมัครไม่สำเร็จ: " + error.message);
    setApp(data); setEditing(false); notify("บันทึกใบสมัครแล้ว — รอผู้ดูแลพิจารณาแต่งตั้ง");
  };

  if (app === undefined) return <p className="muted" role="status">กำลังโหลด…</p>;
  const hasData = !!(app && (app.full_name || app.position || app.specialties || app.phone || app.affiliation || app.motivation || app.medical_center_id));
  const validDate = !!(app && app.updated_at && new Date(app.updated_at).getFullYear() > 2000);
  const meta = app && app.status ? (ST[app.status] || ["—", ""]) : null;
  const startEdit = () => { setForm({ ...blank(profile), ...(app || {}), medical_center_id: (app && app.medical_center_id) || "" }); setEditing(true); };
  return (
    <div style={{ maxWidth: 760 }}>
      <div className="workspace-heading"><div><h2>สมัครเป็นผู้ออกข้อสอบ</h2><p>กรอกรายละเอียดเพื่อสมัครเป็นคณะกรรมการออกข้อสอบ — ผู้ดูแล (สพพ.) จะพิจารณาและแต่งตั้ง จากนั้นจึงจะเข้าใช้งานคลังข้อสอบของตนเองได้ · แก้ไขได้ตลอดจนกว่าจะได้รับแต่งตั้ง</p></div></div>

      {app && !editing ? <div className="card">
        <div className="row" style={{ alignItems: "center", gap: 10, marginBottom: 10 }}>
          {meta && <span className={"pill " + meta[1]}>{meta[0]}</span>}
          {validDate && <span className="muted">ส่ง/แก้ไขล่าสุด {new Date(app.updated_at).toLocaleString("th-TH")}</span>}
          {app.status !== "appointed" && <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={startEdit}>{hasData ? "✎ แก้ไขข้อมูล" : "กรอกข้อมูล"}</button>}
        </div>
        {app.status === "appointed" && <p className="set-note">🎉 คุณได้รับการแต่งตั้งเป็นผู้ออกข้อสอบแล้ว — ไปที่เมนู “คลังข้อสอบของฉัน” เพื่อเริ่มออกข้อสอบได้เลย</p>}
        {app.status === "rejected" && <p className="delivery-alert">ใบสมัครยังไม่ผ่านการพิจารณา · แก้ไขและส่งใหม่ได้{app.note ? " — หมายเหตุ: " + app.note : ""}</p>}
        {!hasData ? <p className="muted" style={{ margin: "6px 0" }}>ยังไม่ได้กรอกข้อมูลใบสมัคร — กด “กรอกข้อมูล” เพื่อเริ่ม</p> :
        <dl className="wa-view">
          {[["ชื่อ-สกุล", app.full_name], ["ตำแหน่ง", app.position], ["สังกัด/หน่วยงาน", app.affiliation], ["ศูนย์แพทย์", centers.find((c) => String(c.id) === String(app.medical_center_id))?.short_name || "—"], ["สาขาที่เชี่ยวชาญ", app.specialties], ["โทรศัพท์", app.phone], ["อีเมล", app.email], ["ประสบการณ์/เหตุผล", app.motivation]].map(([k, v]) =>
            <div key={k} className="wa-row"><dt>{k}</dt><dd>{v || "—"}</dd></div>)}
        </dl>}
      </div> : form && <div className="card">
        <div className="field"><label>ชื่อ-สกุล<R /></label><input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} /></div>
        <div className="grid2" style={{ marginTop: 8 }}>
          <div className="field"><label>ตำแหน่ง<R /></label><input value={form.position} onChange={(e) => set("position", e.target.value)} placeholder="เช่น อาจารย์แพทย์ / นายแพทย์ชำนาญการ" /></div>
          <div className="field"><label>สังกัด/หน่วยงาน<R /></label><input value={form.affiliation} onChange={(e) => set("affiliation", e.target.value)} placeholder="เช่น กลุ่มงานอายุรกรรม" /></div>
        </div>
        <div className="grid2" style={{ marginTop: 8 }}>
          <div className="field"><label>ศูนย์แพทย์<R /></label><select value={form.medical_center_id} onChange={(e) => set("medical_center_id", e.target.value)}><option value="">— เลือก —</option>{centers.map((c) => <option key={c.id} value={c.id}>{c.short_name || c.name_th}</option>)}</select></div>
          <div className="field"><label>สาขาที่เชี่ยวชาญ / ถนัดออกข้อสอบ<R /></label><select value={form.specialties} onChange={(e) => set("specialties", e.target.value)}><option value="">— เลือก —</option>{specs.map((s) => <option key={s.name_th} value={s.name_th}>{s.name_th}{s.name_en ? " (" + s.name_en + ")" : ""}</option>)}</select></div>
        </div>
        <div className="grid2" style={{ marginTop: 8 }}>
          <div className="field"><label>โทรศัพท์<R /></label><input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div className="field"><label>อีเมล<R /></label><input value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
        </div>
        <div className="field" style={{ marginTop: 8 }}><label>ประสบการณ์การออกข้อสอบ / เหตุผลในการสมัคร <span className="muted">(ไม่บังคับ)</span></label><textarea rows={4} value={form.motivation} onChange={(e) => set("motivation", e.target.value)} /></div>
        <div className="row" style={{ gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
          {app && <button className="btn ghost" disabled={busy} onClick={() => setEditing(false)}>ยกเลิก</button>}
          <button className="btn" disabled={busy} onClick={submit}>{busy ? "กำลังบันทึก…" : app ? "บันทึก" : "ส่งใบสมัคร"}</button>
        </div>
      </div>}
    </div>
  );
}
