"use client";
import { useState } from "react";
const TERMS = [
  ["ข้อมูลที่จัดเก็บ", "สพพ. (สำนักส่งเสริมสนับสนุนการผลิต พัฒนาแพทย์และบุคลากรทางการแพทย์) ในฐานะผู้ควบคุมข้อมูล เก็บชื่อ-สกุล รหัสนักศึกษา อีเมล ศูนย์แพทย์ การลงทะเบียนและการเข้าสอบ คำตอบ คะแนน ผลสอบ และสัญญาณระหว่างการคุมสอบออนไลน์ (เช่น การสลับ/ออกจากหน้าจอ)"],
  ["วัตถุประสงค์", "เพื่อลงทะเบียนและจัดสอบ ตรวจให้คะแนน รายงานผล ออกประกาศนียบัตร และพัฒนาคุณภาพการสอบ"],
  ["การคุมสอบออนไลน์", "ระบบบันทึกสัญญาณการใช้งานระหว่างสอบเพื่อรักษาความสุจริตของการสอบ โดยเป็นเพียงข้อมูลประกอบ ไม่ถือเป็นหลักฐานการทุจริตโดยตรง"],
  ["การเปิดเผยผล", "อาจเปิดเผยผลต่อศูนย์แพทย์/คณะต้นสังกัด และแพทยสภา/ศรว. รวมถึงการประกาศรายชื่อผู้ผ่านและการออกประกาศนียบัตร ตามภารกิจ"],
  ["สิทธิของท่าน", "ท่านมีสิทธิ์เข้าถึงและขอแก้ไขข้อมูล ทั้งนี้การถอนความยินยอมไม่สามารถยกเลิกการสอบที่ได้ดำเนินการไปแล้วได้"],
];
export default function StudentConsent({ sb, profile, onDone, onSignOut }) {
  const [agreed, setAgreed] = useState(false);
  const [research, setResearch] = useState(false);
  const [seen, setSeen] = useState(false);
  const [open, setOpen] = useState(false);
  const [openR, setOpenR] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const confirm = async () => {
    if (!agreed) return setErr("กรุณาอ่านเงื่อนไขและติ๊กยืนยันก่อน");
    setBusy(true); setErr("");
    const { error } = await sb.rpc("student_consent_accept", { _research: research });
    setBusy(false);
    if (error) return setErr(error.message);
    onDone();
  };
  return (
    <div className="login"><div className="box" style={{ maxWidth: 640, width: "100%", textAlign: "left" }}>
      <img src="/cpird-logo.png" alt="" style={{ height: 64, display: "block", margin: "0 auto 10px" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
      <h2 style={{ color: "var(--accent)", textAlign: "center", marginBottom: 4 }}>ยืนยันการสมัครสอบและการคุ้มครองข้อมูล</h2>
      <p className="muted" style={{ textAlign: "center", marginBottom: 14 }}>บัญชี {profile?.full_name || profile?.email}</p>
      <div className="consent-gate" style={{ borderTop: "none", marginTop: 0, paddingTop: 0 }}>
        <div className={"consent-item" + (agreed ? " done" : "")}>
          <div className="consent-head">
            <label className="consent-check"><input type="checkbox" checked={agreed} disabled={!seen} onChange={(e) => setAgreed(e.target.checked)} /><b>{agreed ? "✓ " : ""}ข้าพเจ้าได้อ่าน รับทราบการคุ้มครองข้อมูล และยืนยันสมัครสอบ</b></label>
            <button type="button" className="btn ghost sm" onClick={() => { setOpen((o) => !o); setSeen(true); }}>{open ? "ย่อ" : seen ? "อ่านอีกครั้ง" : "อ่านเงื่อนไข"}</button>
          </div>
          {!open && !seen && <p className="consent-hint">กด “อ่านเงื่อนไข” ก่อนยืนยัน</p>}
          {open && <ol className="consent-list">{TERMS.map(([t, b]) => <li key={t}><b>{t}</b> — {b}</li>)}</ol>}
        </div>
        <div className={"consent-item optional" + (research ? " done" : "")}>
          <div className="consent-head">
            <label className="consent-check"><input type="checkbox" checked={research} onChange={(e) => setResearch(e.target.checked)} /><b>ยินยอมให้ใช้ข้อมูลการสอบเพื่อการวิจัย/พัฒนา <span className="muted" style={{ fontWeight: 400 }}>(ไม่บังคับ)</span></b></label>
            <button type="button" className="btn ghost sm" onClick={() => setOpenR((o) => !o)}>{openR ? "ย่อ" : "อ่าน"}</button>
          </div>
          {openR && <p className="consent-body">นำข้อมูลการสอบ (ในรูปแบบที่ไม่ระบุตัวตนเท่าที่ทำได้) ไปใช้เพื่อการวิจัยและพัฒนาคุณภาพการเรียนการสอนและการสอบ · เลือกได้ ไม่กระทบสิทธิ์การสอบ</p>}
        </div>
      </div>
      {err && <p className="delivery-alert" style={{ marginTop: 10 }}>{err}</p>}
      <button className="btn" disabled={busy || !agreed} onClick={confirm} style={{ width: "100%", marginTop: 14 }}>{busy ? "กำลังบันทึก…" : "ยืนยันและเข้าสอบ"}</button>
      <button className="btn ghost sm" onClick={onSignOut} style={{ marginTop: 10 }}>ออกจากระบบ</button>
    </div></div>
  );
}
