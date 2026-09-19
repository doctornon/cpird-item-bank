"use client";
// ประกาศสนามสอบ — ด้านบนเป็นเครื่องมือตรวจการสมัครของศูนย์ ด้านล่างคือประกาศที่พิมพ์ติดบอร์ด
// ประกาศพิมพ์จากรายชื่อ "ผู้สมัครจริง" ของรอบที่เลือก ไม่ใช่นักศึกษาทุกคนในศูนย์อย่างเดิม
// เพราะรายชื่อที่ติดหน้าห้องสอบต้องตรงกับคนที่จะมาสอบจริง
import { useCallback, useState } from "react";
import CenterExamDashboard from "./CenterExamDashboard";
import { thaiDateTime } from "../lib/countdown.mjs";

export default function CenterAnnouncements({ sb, notify }) {
  const [registered, setRegistered] = useState([]);
  const [exam, setExam] = useState(null);
  const [center, setCenter] = useState(null);
  const [venue, setVenue] = useState("");

  const onRegisteredChange = useCallback((rows, e, c) => {
    setRegistered(rows || []); setExam(e || null); if (c) setCenter(c);
  }, []);

  return (
    <div>
      <div className="workspace-heading no-print">
        <div>
          <h2>ประกาศสนามสอบ</h2>
          <p>ตรวจรายชื่อผู้สมัครของศูนย์ให้พร้อมก่อนวันสอบ แล้วพิมพ์ประกาศติดหน้าห้องสอบ</p>
        </div>
        <button className="btn" disabled={!exam} onClick={() => window.print()}>🖨️ พิมพ์ประกาศ</button>
      </div>

      <CenterExamDashboard sb={sb} notify={notify} onRegisteredChange={onRegisteredChange} />

      <div className="card no-print" style={{ margin: "16px 0" }}>
        <div className="field">
          <label>สถานที่/ห้องสอบ (พิมพ์ลงประกาศ)</label>
          <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="เช่น อาคารเรียนรวม ห้อง 301" />
        </div>
      </div>

      {!exam ? <div className="empty no-print">เลือกรอบสอบด้านบนเพื่อดูตัวอย่างประกาศ</div> : (
        <div className="card announce">
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <img src="/cpird-logo.png" alt="" style={{ height: 60 }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
            <h2 style={{ marginTop: 8 }}>ประกาศสนามสอบ</h2>
            <div className="muted">สำนักส่งเสริมสนับสนุนการผลิต พัฒนาแพทย์และบุคลากรทางการแพทย์ (สพพ.)</div>
          </div>
          <p style={{ margin: "4px 0" }}><b>การสอบ:</b> {exam.title}</p>
          <p style={{ margin: "4px 0" }}><b>วันเวลา:</b> {thaiDateTime(exam.starts_at)}</p>
          <p style={{ margin: "4px 0" }}><b>ศูนย์แพทย์:</b> {center?.name || "—"}</p>
          {venue && <p style={{ margin: "4px 0" }}><b>สถานที่สอบ:</b> {venue}</p>}
          <p style={{ margin: "4px 0" }}><b>จำนวนผู้เข้าสอบ:</b> {registered.length} คน</p>
          <div className="tablewrap" style={{ marginTop: 10, boxShadow: "none" }}>
            <table>
              <thead><tr><th style={{ width: 60 }}>ลำดับ</th><th>รหัสนักศึกษา</th><th>ชื่อ-สกุล</th><th style={{ width: 120 }}>ลงลายมือชื่อ</th></tr></thead>
              <tbody>
                {registered.length === 0
                  ? <tr><td colSpan={4}><div className="empty">ยังไม่มีผู้สมัครสอบในรอบนี้</div></td></tr>
                  : registered.map((s, i) => (
                    <tr key={s.user_id}><td>{i + 1}</td><td>{s.student_id || "—"}</td><td>{s.full_name || s.email}</td><td></td></tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ marginTop: 14, textAlign: "right" }}>
            ออกประกาศ ณ วันที่ {new Date().toLocaleDateString("th-TH", { dateStyle: "long" })}
          </p>
        </div>
      )}
    </div>
  );
}
