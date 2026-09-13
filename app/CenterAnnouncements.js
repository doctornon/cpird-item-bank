"use client";
import { useCallback, useEffect, useState } from "react";
const dt = (s) => s ? new Date(s).toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short" }) : "—";
export default function CenterAnnouncements({ sb, notify }) {
  const [rounds, setRounds] = useState([]);
  const [students, setStudents] = useState([]);
  const [rid, setRid] = useState("");
  const [venue, setVenue] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: r, error: e1 }, { data: s, error: e2 }] = await Promise.all([
      sb.rpc("center_exam_rounds"),
      sb.rpc("center_students_list", { _q: null, _scope: "mine" }),
    ]);
    setLoading(false);
    if (e1) return notify("โหลดรอบสอบไม่สำเร็จ: " + e1.message);
    if (e2) return notify("โหลดรายชื่อไม่สำเร็จ: " + e2.message);
    setRounds(r || []); setStudents(s || []);
  }, [sb, notify]);
  useEffect(() => { load(); }, [load]);
  const round = rounds.find((x) => String(x.id) === String(rid));
  const centerName = students[0]?.center_name;
  return (
    <div>
      <div className="workspace-heading no-print"><div><h2>ประกาศสนามสอบ</h2><p>เลือกรอบสอบเพื่อออกประกาศรายชื่อผู้เข้าสอบของศูนย์{centerName ? " " + centerName : "ของท่าน"} · พิมพ์ติดประกาศได้</p></div>
        <button className="btn" disabled={!round} onClick={() => window.print()}>🖨️ พิมพ์ประกาศ</button></div>
      <div className="card no-print" style={{ marginBottom: 16 }}>
        <div className="grid2">
          <div className="field"><label>รอบสอบ</label><select value={rid} onChange={(e) => setRid(e.target.value)}><option value="">— เลือกรอบสอบ —</option>{rounds.map((r) => <option key={r.id} value={r.id}>{r.title} · {dt(r.open_at)}</option>)}</select></div>
          <div className="field"><label>สถานที่/ห้องสอบ (พิมพ์ลงประกาศ)</label><input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="เช่น อาคารเรียนรวม ห้อง 301" /></div>
        </div>
        {rounds.length === 0 && <p className="muted" style={{ marginTop: 8 }}>ยังไม่มีรอบสอบสำหรับศูนย์ของท่าน</p>}
      </div>
      {loading ? <p className="muted">กำลังโหลด…</p> : !round ? <div className="empty no-print">เลือกรอบสอบเพื่อดูตัวอย่างประกาศ</div> :
      <div className="card announce">
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <img src="/cpird-logo.png" alt="" style={{ height: 60 }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
          <h2 style={{ marginTop: 8 }}>ประกาศสนามสอบ</h2>
          <div className="muted">สำนักส่งเสริมสนับสนุนการผลิต พัฒนาแพทย์และบุคลากรทางการแพทย์ (สพพ.)</div>
        </div>
        <p style={{ margin: "4px 0" }}><b>การสอบ:</b> {round.title}</p>
        <p style={{ margin: "4px 0" }}><b>วันเวลา:</b> {dt(round.open_at)}{round.close_at ? " – " + dt(round.close_at) : ""}</p>
        <p style={{ margin: "4px 0" }}><b>ศูนย์แพทย์:</b> {centerName || "—"}</p>
        {venue && <p style={{ margin: "4px 0" }}><b>สถานที่สอบ:</b> {venue}</p>}
        <p style={{ margin: "4px 0" }}><b>จำนวนผู้เข้าสอบ:</b> {students.length} คน</p>
        <div className="tablewrap" style={{ marginTop: 10, boxShadow: "none" }}><table>
          <thead><tr><th style={{ width: 60 }}>ลำดับ</th><th>รหัสนักศึกษา</th><th>ชื่อ-สกุล</th><th style={{ width: 120 }} className="no-print">ลงลายมือชื่อ</th></tr></thead>
          <tbody>{students.length === 0 ? <tr><td colSpan={4}><div className="empty">ยังไม่มีนักศึกษาในศูนย์</div></td></tr> :
            students.map((s, i) => <tr key={s.id}><td>{i + 1}</td><td>{s.student_id || "—"}</td><td>{s.full_name || s.email}</td><td></td></tr>)}</tbody>
        </table></div>
        <p className="muted" style={{ marginTop: 14, textAlign: "right" }}>ออกประกาศ ณ วันที่ {new Date().toLocaleDateString("th-TH", { dateStyle: "long" })}</p>
      </div>}
    </div>
  );
}
