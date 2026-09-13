"use client";
export default function HomeCards({ profile, roles = [], superAdmin, canWrite, onNavigate, only }) {
  const isCommittee = superAdmin || ["item_writer", "reviewer", "set_manager", "analyst", "committee"].some((r) => roles.includes(r));
  const cards = [
    {
      key: "teacher", icon: "🩺", tone: "a",
      title: "อาจารย์แพทย์ (ผู้ออกข้อสอบ)",
      bullets: ["สมัครเป็นคณะกรรมการออกข้อสอบ", "ร่างและส่งข้อสอบเข้าคลัง", "ดูและแก้ไขข้อสอบของตนเอง", "ทดลองทำข้อสอบในโหมดตัวอย่าง (demo)"],
      actions: isCommittee
        ? [...(canWrite ? [["คลังข้อสอบของฉัน", () => onNavigate("mybank")]] : []), ["แก้ไขใบสมัคร / ดูสถานะ", () => onNavigate("apply")], ["ทดลองโหมด demo", () => onNavigate("take")]]
        : [["✍️ สมัครเป็นผู้ออกข้อสอบ", () => onNavigate("apply"), true], ["ทดลองโหมด demo", () => onNavigate("take")]],
    },
    {
      key: "staff", icon: "🗂️", tone: "b",
      title: "นักวิชาการศึกษา / เจ้าหน้าที่ศูนย์แพทย์",
      bullets: ["จัดการบัญชีนักศึกษาของศูนย์ตนเอง", "ดูปฏิทินสอบ", "ดูและพิมพ์ประกาศสนามสอบ", "การเตรียมตัวสอบและระบบจัดการการสอบ"],
      actions: [["บัญชีนักศึกษาของศูนย์", () => onNavigate("students"), true], ["ประกาศสนามสอบ", () => onNavigate("announce")], ["ปฏิทินสอบ", () => onNavigate("schedule")]],
    },
    {
      key: "admin", icon: "🛡️", tone: "c",
      title: "เจ้าหน้าที่ สพพ. (ผู้ดูแลระบบ)",
      bullets: ["จัดการบัญชีผู้ใช้ทั้งอาจารย์ นักวิชาการ และนักศึกษา", "กำหนดสิทธิ์การเข้าดูข้อสอบและจัดชุดข้อสอบ", "พิจารณาแต่งตั้งผู้ออกข้อสอบ"],
      actions: superAdmin ? [["จัดการบัญชีผู้ใช้", () => onNavigate("accounts")], ["จัดการสิทธิ์", () => onNavigate("roles")]] : [["สำหรับผู้ดูแลระบบเท่านั้น", null]],
    },
    {
      key: "student", icon: "🎓", tone: "d",
      title: "นิสิต / นักศึกษาแพทย์",
      bullets: ["ลงทะเบียนเข้าสอบ", "ทำข้อสอบออนไลน์", "ดูผลสอบ", "ดูเฉลยของชุดข้อสอบที่ได้สอบ"],
      actions: [["เข้าห้องสอบ / ทำข้อสอบ", () => onNavigate("take"), true]],
    },
  ];
  const visible = only ? cards.filter((c) => only.includes(c.key)) : cards;
  return (
    <div>
      <div className="workspace-heading"><div><h2>ยินดีต้อนรับสู่ระบบจัดทดสอบและวัดผล สพพ.</h2><p>{visible.length > 1 ? "เลือกบทบาทการใช้งานของคุณ" : "บทบาทการใช้งานของคุณ"} — {profile?.full_name || profile?.email}</p></div></div>
      <div className={"role-cards" + (visible.length === 1 ? " role-cards-solo" : "")}>
        {visible.map((c) => (
          <article key={c.key} className={"role-card role-" + c.tone}>
            <div className="role-icon" aria-hidden="true">{c.icon}</div>
            <h3>{c.title}</h3>
            <ul className="role-bullets">{c.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
            <div className="role-actions">
              {c.actions.map(([label, fn, primary], i) => fn
                ? <button key={i} className={"btn " + (primary ? "" : "ghost") + " sm"} onClick={fn}>{label}</button>
                : <span key={i} className="muted">{label}</span>)}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
