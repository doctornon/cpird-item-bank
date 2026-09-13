"use client";
import { useCallback, useEffect, useState } from "react";
const ST = { pending: ["รอพิจารณา", "draft"], appointed: ["ได้รับแต่งตั้งแล้ว", "approved"], rejected: ["ไม่ผ่านการพิจารณา", "retired"] };
const blank = (profile) => ({ full_name: profile?.full_name || "", position: "", affiliation: "", medical_center_id: "", specialties: "", phone: "", email: profile?.email || "", motivation: "" });

export default function WriterApplication({ sb, profile, notify }) {
  const [app, setApp] = useState(undefined); // undefined=loading, null=none
  const [form, setForm] = useState(null);
  const [centers, setCenters] = useState([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const [{ data: a }, { data: mc }] = await Promise.all([
      sb.rpc("exam_writer_my"),
      sb.from("medical_centers").select("id,name_th,short_name").eq("is_active", true),
    ]);
    setCenters((mc || []).sort((x, y) => ((y.short_name === "สพพ.") - (x.short_name === "สพพ.")) || (x.short_name || x.name_th).localeCompare(y.short_name || y.name_th, "th")));
    setApp(a || null);
    if (!a) { setForm(blank(profile)); setEditing(true); }
  }, [sb, profile]);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    if (!form.full_name.trim()) return notify("กรอกชื่อ-สกุล");
    setBusy(true);
    const { data, error } = await sb.rpc("exam_writer_apply", { _data: { ...form } });
    setBusy(false);
    if (error) return notify("ส่งใบสมัครไม่สำเร็จ: " + error.message);
    setApp(data); setEditing(false); notify("ส่งใบสมัครแล้ว — รอผู้ดูแลพิจารณาแต่งตั้ง");
  };

  if (app === undefined) return <p className="muted" role="status">กำลังโหลด…</p>;
  const meta = app ? (ST[app.status] || ["—", ""]) : null;
  return (
    <div style={{ maxWidth: 760 }}>
      <div className="workspace-heading"><div><h2>สมัครเป็นผู้ออกข้อสอบ</h2><p>กรอกรายละเอียดเพื่อสมัครเป็นคณะกรรมการออกข้อสอบ — ผู้ดูแล (สพพ.) จะพิจารณาและแต่งตั้ง จากนั้นจึงจะเข้าใช้งานคลังข้อสอบของตนเองได้ · แก้ไขใบสมัครได้ตลอดจนกว่าจะได้รับแต่งตั้ง</p></div></div>

      {app && !editing ? <div className="card">
        <div className="row" style={{ alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span className={"pill " + meta[1]}>{meta[0]}</span>
          <span className="muted">ส่ง/แก้ไขล่าสุด {new Date(app.updated_at).toLocaleString("th-TH")}</span>
          {app.status !== "appointed" && <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={() => { setForm({ ...blank(profile), ...app, medical_center_id: app.medical_center_id || "" }); setEditing(true); }}>✎ แก้ไขใบสมัคร</button>}
        </div>
        {app.status === "appointed" && <p className="set-note">🎉 คุณได้รับการแต่งตั้งเป็นผู้ออกข้อสอบแล้ว — ไปที่เมนู “คลังข้อสอบของฉัน” เพื่อเริ่มออกข้อสอบได้เลย</p>}
        {app.status === "rejected" && <p className="delivery-alert">ใบสมัครยังไม่ผ่านการพิจารณา · แก้ไขและส่งใหม่ได้{app.note ? " — หมายเหตุ: " + app.note : ""}</p>}
        <dl className="wa-view">
          {[["ชื่อ-สกุล", app.full_name], ["ตำแหน่ง", app.position], ["สังกัด/หน่วยงาน", app.affiliation], ["ศูนย์แพทย์", centers.find((c) => String(c.id) === String(app.medical_center_id))?.short_name || "—"], ["สาขาที่เชี่ยวชาญ", app.specialties], ["โทรศัพท์", app.phone], ["อีเมล", app.email], ["ประสบการณ์/เหตุผล", app.motivation]].map(([k, v]) =>
            <div key={k} className="wa-row"><dt>{k}</dt><dd>{v || "—"}</dd></div>)}
        </dl>
      </div> : form && <div className="card">
        <div className="field"><label>ชื่อ-สกุล</label><input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} /></div>
        <div className="grid2" style={{ marginTop: 8 }}>
          <div className="field"><label>ตำแหน่ง</label><input value={form.position} onChange={(e) => set("position", e.target.value)} placeholder="เช่น อาจารย์แพทย์ / นายแพทย์ชำนาญการ" /></div>
          <div className="field"><label>สังกัด/หน่วยงาน</label><input value={form.affiliation} onChange={(e) => set("affiliation", e.target.value)} placeholder="เช่น กลุ่มงานอายุรกรรม" /></div>
        </div>
        <div className="grid2" style={{ marginTop: 8 }}>
          <div className="field"><label>ศูนย์แพทย์</label><select value={form.medical_center_id} onChange={(e) => set("medical_center_id", e.target.value)}><option value="">— เลือก —</option>{centers.map((c) => <option key={c.id} value={c.id}>{c.short_name || c.name_th}</option>)}</select></div>
          <div className="field"><label>สาขาที่เชี่ยวชาญ / ถนัดออกข้อสอบ</label><input value={form.specialties} onChange={(e) => set("specialties", e.target.value)} placeholder="เช่น อายุรศาสตร์, โรคหัวใจ" /></div>
        </div>
        <div className="grid2" style={{ marginTop: 8 }}>
          <div className="field"><label>โทรศัพท์</label><input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div className="field"><label>อีเมล</label><input value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
        </div>
        <div className="field" style={{ marginTop: 8 }}><label>ประสบการณ์การออกข้อสอบ / เหตุผลในการสมัคร</label><textarea rows={4} value={form.motivation} onChange={(e) => set("motivation", e.target.value)} /></div>
        <div className="row" style={{ gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
          {app && <button className="btn ghost" disabled={busy} onClick={() => setEditing(false)}>ยกเลิก</button>}
          <button className="btn" disabled={busy} onClick={submit}>{busy ? "กำลังส่ง…" : app ? "บันทึกการแก้ไข" : "ส่งใบสมัคร"}</button>
        </div>
      </div>}
    </div>
  );
}
