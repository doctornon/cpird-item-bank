"use client";
// นับถอยหลังวันสอบแบบเดินจริงทุกวินาที พร้อมการสมัครสอบและโมดูลคำแนะนำการเตรียมสอบ
// วันสอบและเดดไลน์มาจากตาราง exam_schedule เซิร์ฟเวอร์เป็นผู้บังคับเดดไลน์จริง
// ส่วนนี้ทำหน้าที่แสดงผลและเรียก RPC เท่านั้น
import { useCallback, useEffect, useState } from "react";
import {
  timeLeft, examsForStudent, thaiDateTime, countdownLabel, urgency,
  fromRow, registrationState, deadlineLabel,
} from "../lib/countdown.mjs";
import { PREP_PORTAL } from "../lib/examSchedule.mjs";

const pad = (n) => String(n).padStart(2, "0");

function Unit({ value, label, pad2 = true }) {
  return <div className="cd-unit"><b>{pad2 ? pad(value) : value}</b><span>{label}</span></div>;
}

function ExamCard({ exam, now, registered, busy, onRegister, onCancel }) {
  const left = timeLeft(exam.at, now);
  if (!left) return null;
  const tone = urgency(left);
  const reg = registrationState(exam, now, registered);
  return (
    <article className={"cd-card cd-" + tone + (registered ? " cd-signed" : "")}>
      <div className="cd-head">
        <span className="pill cd-kind">{exam.kind}</span>
        <h3>{exam.title}</h3>
        {registered && <span className="pill approved cd-tag">สมัครแล้ว</span>}
      </div>
      <p className="cd-when">{thaiDateTime(exam.at)}</p>

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
          <p className="sr-only" role="status">{exam.title} {countdownLabel(left)}</p>
        </>
      )}

      {exam.closesAt && (
        <p className={"cd-deadline" + (reg.warn ? " is-warn" : "") + (reg.closed ? " is-closed" : "")}>
          {reg.warn ? "⚠ " : ""}{deadlineLabel(reg)}
          <span className="cd-deadline-date"> ({thaiDateTime(exam.closesAt)})</span>
        </p>
      )}

      <div className="cd-actions">
        {reg.canRegister && (
          <button className="btn sm" disabled={busy} onClick={() => onRegister(exam)}>สมัครสอบ</button>
        )}
        {reg.canCancel && (
          <button className="btn ghost sm" disabled={busy} onClick={() => onCancel(exam)}>ยกเลิกการสมัคร</button>
        )}
        {reg.closed && !registered && (
          <span className="muted">หมดเขตแล้ว — ติดต่อเจ้าหน้าที่ศูนย์แพทย์หากต้องการเข้าสอบ</span>
        )}
      </div>

      {exam.where && <p className="cd-where">สถานที่สอบ: {exam.where}</p>}
    </article>
  );
}

function PrepCard() {
  const ready = !!PREP_PORTAL.url;
  return (
    <article className="cd-card cd-prep">
      <div className="cd-head"><span className="pill cd-kind">เตรียมสอบ</span><h3>{PREP_PORTAL.title}</h3></div>
      <p className="cd-blurb">{PREP_PORTAL.blurb}</p>
      {ready
        ? <a className="btn" href={PREP_PORTAL.url} target="_blank" rel="noopener noreferrer">เปิด CPIRD Wise Portal ↗</a>
        : <p className="muted" style={{ margin: 0 }}>กำลังจัดเตรียม — จะเปิดให้เข้าใช้เร็ว ๆ นี้</p>}
    </article>
  );
}

export default function ExamCountdown({ sb, studentYear, notify }) {
  const [now, setNow] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [mine, setMine] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  // เริ่มนับหลังเรนเดอร์ครั้งแรก เพื่อไม่ให้เวลาฝั่งเซิร์ฟเวอร์กับฝั่งเบราว์เซอร์ต่างกัน
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const loadMine = useCallback(async () => {
    const { data } = await sb.from("exam_registrations").select("exam_key").is("cancelled_at", null);
    setMine(new Set((data || []).map((r) => r.exam_key)));
  }, [sb]);

  useEffect(() => {
    if (!sb) return;
    let alive = true;
    (async () => {
      const { data, error } = await sb.from("exam_schedule")
        .select("exam_key,kind,title,starts_at,years,where_text,register_closes_at")
        .eq("active", true).order("sort_order");
      if (!alive) return;
      setSchedule(error ? [] : (data || []).map(fromRow));
      await loadMine();
    })();
    return () => { alive = false; };
  }, [sb, loadMine]);

  const act = async (fn, exam, okMsg) => {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) return notify?.(error.message);
    await loadMine();
    notify?.(okMsg.replace("{title}", exam.title));
  };
  const register = (exam) => act(() => sb.rpc("exam_register", { _exam_key: exam.key }), exam, "สมัคร {title} เรียบร้อย");
  const cancel = (exam) => act(() => sb.rpc("exam_register_cancel", { _exam_key: exam.key }), exam, "ยกเลิกการสมัคร {title} แล้ว");

  if (now == null || schedule == null) return null;
  const exams = examsForStudent(schedule, studentYear, now);
  if (!exams.length && !PREP_PORTAL.url) return null;

  return (
    <section className="cd-strip" aria-label="นับถอยหลังวันสอบ การสมัครสอบ และคำแนะนำการเตรียมสอบ">
      {exams.map((e) => (
        <ExamCard key={e.key} exam={e} now={now} registered={mine.has(e.key)}
          busy={busy} onRegister={register} onCancel={cancel} />
      ))}
      <PrepCard />
    </section>
  );
}
