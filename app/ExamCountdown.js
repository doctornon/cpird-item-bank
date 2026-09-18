"use client";
// นับถอยหลังวันสอบแบบเดินจริงทุกวินาที พร้อมโมดูลลิงก์คำแนะนำการเตรียมสอบ
// การคำนวณทั้งหมดอยู่ใน lib/countdown.mjs ไฟล์นี้ทำหน้าที่แสดงผลอย่างเดียว
import { useEffect, useState } from "react";
import { timeLeft, examsForStudent, thaiDateTime, countdownLabel, urgency } from "../lib/countdown.mjs";
import { EXAM_SCHEDULE, PREP_PORTAL } from "../lib/examSchedule.mjs";

const pad = (n) => String(n).padStart(2, "0");

function Unit({ value, label, pad2 = true }) {
  return (
    <div className="cd-unit">
      <b>{pad2 ? pad(value) : value}</b>
      <span>{label}</span>
    </div>
  );
}

function ExamCard({ exam, now }) {
  const left = timeLeft(exam.at, now);
  if (!left) return null;
  const tone = urgency(left);
  const spoken = countdownLabel(left);
  return (
    <article className={"cd-card cd-" + tone}>
      <div className="cd-head">
        <span className="pill cd-kind">{exam.kind}</span>
        <h3>{exam.title}</h3>
      </div>
      <p className="cd-when">{thaiDateTime(exam.at)}</p>

      {/* ตัวเลขเดินทุกวินาทีจึงซ่อนจากโปรแกรมอ่านหน้าจอ แล้วประกาศสรุประดับนาทีแทน */}
      {left.past ? (
        <p className="cd-now" role="status">⏰ ถึงเวลาสอบแล้ว</p>
      ) : (
        <>
          <div className="cd-clock" aria-hidden="true">
            <Unit value={left.days} label="วัน" pad2={false} />
            <Unit value={left.hours} label="ชั่วโมง" />
            <Unit value={left.minutes} label="นาที" />
            <Unit value={left.seconds} label="วินาที" />
          </div>
          <p className="sr-only" role="status">{exam.title} {spoken}</p>
        </>
      )}
      {exam.where && <p className="cd-where">สถานที่สอบ: {exam.where}</p>}
    </article>
  );
}

function PrepCard() {
  const ready = !!PREP_PORTAL.url;
  return (
    <article className="cd-card cd-prep">
      <div className="cd-head">
        <span className="pill cd-kind">เตรียมสอบ</span>
        <h3>{PREP_PORTAL.title}</h3>
      </div>
      <p className="cd-blurb">{PREP_PORTAL.blurb}</p>
      {ready ? (
        <a className="btn" href={PREP_PORTAL.url} target="_blank" rel="noopener noreferrer">
          เปิด CPIRD Wise Portal ↗
        </a>
      ) : (
        <p className="muted" style={{ margin: 0 }}>กำลังจัดเตรียม — จะเปิดให้เข้าใช้เร็ว ๆ นี้</p>
      )}
    </article>
  );
}

export default function ExamCountdown({ studentYear }) {
  const [now, setNow] = useState(null);

  // เริ่มนับหลังเรนเดอร์ครั้งแรก เพื่อไม่ให้เวลาฝั่งเซิร์ฟเวอร์กับฝั่งเบราว์เซอร์ต่างกัน
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (now == null) return null;
  const exams = examsForStudent(EXAM_SCHEDULE, studentYear, now);
  if (!exams.length && !PREP_PORTAL.url) return null;

  return (
    <section className="cd-strip" aria-label="นับถอยหลังวันสอบและคำแนะนำการเตรียมสอบ">
      {exams.map((e) => <ExamCard key={e.key} exam={e} now={now} />)}
      <PrepCard />
    </section>
  );
}
