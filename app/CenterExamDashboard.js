"use client";
// ภาพรวมการสมัครสอบของศูนย์ สำหรับนักวิชาการและอาจารย์แพทย์ admin ประจำศูนย์
// จงใจแสดงทั้งคนที่สมัครแล้วและคนที่ยังไม่สมัคร เพราะงานคือตรวจให้พร้อมก่อนสอบ ไม่ใช่ดูแค่ยอด
import { useCallback, useEffect, useState } from "react";
import { thaiDateTime } from "../lib/countdown.mjs";

// ธงจากฝั่งเซิร์ฟเวอร์ แปลเป็นข้อความที่เจ้าหน้าที่ทำอะไรต่อได้
const FLAGS = {
  no_student_id: { label: "ไม่มีรหัสนักศึกษา", tone: "warn" },
  no_year: { label: "ไม่ระบุชั้นปี", tone: "warn" },
  center_changed: { label: "ย้ายศูนย์หลังสมัคร", tone: "stop" },
  year_mismatch: { label: "ชั้นปีไม่ตรงรอบสอบ", tone: "stop" },
};

function Tile({ label, value, tone }) {
  return <div className={"reg-tile" + (tone ? " reg-" + tone : "")}><span>{label}</span><b>{value}</b></div>;
}

export default function CenterExamDashboard({ sb, notify, onRegisteredChange }) {
  const [rounds, setRounds] = useState([]);
  const [key, setKey] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("registered");

  useEffect(() => {
    (async () => {
      const { data: r, error } = await sb.from("exam_schedule")
        .select("exam_key,title,starts_at,register_closes_at")
        .eq("active", true).order("sort_order");
      setLoading(false);
      if (error) return notify("โหลดรอบสอบไม่สำเร็จ: " + error.message);
      setRounds(r || []);
      if ((r || []).length) setKey(r[0].exam_key);
    })();
  }, [sb, notify]);

  const load = useCallback(async (k) => {
    if (!k) { setData(null); return; }
    const { data: d, error } = await sb.rpc("exam_center_dashboard", { _exam_key: k });
    if (error) { setData(null); return notify("โหลดข้อมูลการสมัครไม่สำเร็จ: " + error.message); }
    setData(d);
    onRegisteredChange?.(d?.registered || [], d?.exam || null, d?.center || null);
  }, [sb, notify, onRegisteredChange]);

  useEffect(() => { load(key); }, [key, load]);

  const act = async (rpc, userId, name, okMsg) => {
    setBusy(true);
    const { error } = await sb.rpc(rpc, { _exam_key: key, _user_id: userId });
    setBusy(false);
    if (error) return notify(error.message);
    await load(key);
    notify(okMsg.replace("{name}", name || ""));
  };

  if (loading) return <p className="muted">กำลังโหลด…</p>;
  if (!rounds.length) return <div className="empty">ยังไม่มีรอบสอบที่ประกาศไว้</div>;

  const s = data?.summary;
  const exam = data?.exam;
  const list = tab === "registered" ? (data?.registered || []) : (data?.not_registered || []);

  return (
    <section className="reg-dash no-print">
      <div className="workspace-heading" style={{ alignItems: "flex-end" }}>
        <div>
          <h3 className="delivery-subheading" style={{ margin: 0 }}>การสมัครสอบของศูนย์{data?.center?.name ? " " + data.center.name : ""}</h3>
          {exam && (
            <p className="muted" style={{ margin: "2px 0 0" }}>
              สอบ {thaiDateTime(exam.starts_at)} · {exam.closed ? "ปิดรับสมัครแล้ว" : "ปิดรับสมัคร " + thaiDateTime(exam.register_closes_at)}
            </p>
          )}
        </div>
        <div className="field" style={{ marginLeft: "auto", minWidth: 260 }}>
          <label>รอบสอบ</label>
          <select value={key} onChange={(e) => setKey(e.target.value)}>
            {rounds.map((r) => <option key={r.exam_key} value={r.exam_key}>{r.title}</option>)}
          </select>
        </div>
      </div>

      {s && (
        <div className="reg-tiles">
          <Tile label="นักศึกษาที่เข้าเกณฑ์" value={s.eligible} />
          <Tile label="สมัครแล้ว" value={s.registered} tone="good" />
          <Tile label="ยังไม่สมัคร" value={s.not_registered} tone={s.not_registered > 0 ? "warn" : null} />
          <Tile label="ข้อมูลต้องตรวจ" value={s.needs_check} tone={s.needs_check > 0 ? "stop" : null} />
          <Tile label="ศูนย์เพิ่มให้" value={s.by_staff} />
          <Tile label="ยกเลิก" value={s.cancelled} />
        </div>
      )}

      {s?.needs_check > 0 && (
        <div className="delivery-alert" role="alert" style={{ margin: "10px 0" }}>
          มี {s.needs_check} คนที่ข้อมูลยังไม่พร้อม — ตรวจรายการที่ติดธงก่อนวันสอบ
        </div>
      )}

      <div className="qfilter" role="tablist" style={{ margin: "12px 0 8px" }}>
        {[["registered", `สมัครแล้ว (${s?.registered ?? 0})`], ["missing", `ยังไม่สมัคร (${s?.not_registered ?? 0})`]]
          .map(([v, l]) => (
            <button key={v} type="button" className={"status-filter" + (tab === v ? " selected" : "")}
              aria-pressed={tab === v} onClick={() => setTab(v)}>{l}</button>
          ))}
      </div>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 52 }}>ลำดับ</th><th>รหัสนักศึกษา</th><th>ชื่อ-สกุล</th><th>ชั้นปี</th>
              {tab === "registered" ? <><th>สมัครเมื่อ</th><th>ข้อควรตรวจ</th></> : <th>อีเมล</th>}
              <th style={{ width: 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {!list.length ? (
              <tr><td colSpan={7}><div className="empty">
                {tab === "registered" ? "ยังไม่มีผู้สมัครในศูนย์นี้" : "นักศึกษาที่เข้าเกณฑ์สมัครครบทุกคนแล้ว"}
              </div></td></tr>
            ) : list.map((r, i) => (
              <tr key={r.user_id}>
                <td>{i + 1}</td>
                <td>{r.student_id || <span className="gap-short">—</span>}</td>
                <td>{r.full_name || r.email}</td>
                <td>{r.year_level || <span className="gap-short">—</span>}</td>
                {tab === "registered" ? (
                  <>
                    <td>{r.registered_at ? new Date(r.registered_at).toLocaleDateString("th-TH", { dateStyle: "medium" }) : "—"}
                      {r.by_staff && <div className="muted" style={{ fontSize: 11 }}>ศูนย์เพิ่มให้</div>}</td>
                    <td>{(r.flags || []).length === 0 ? <span className="muted">—</span> :
                      (r.flags || []).map((f) => (
                        <span key={f} className={"flag flag-" + (FLAGS[f]?.tone === "stop" ? "stop" : "warn")}
                          style={{ display: "inline-block", marginRight: 4, padding: "2px 8px" }}>
                          {FLAGS[f]?.label || f}
                        </span>
                      ))}</td>
                  </>
                ) : <td className="muted">{r.email}</td>}
                <td>
                  {tab === "registered"
                    ? <button className="btn ghost sm" disabled={busy}
                        onClick={() => act("exam_center_unregister", r.user_id, r.full_name, "นำ {name} ออกจากรายชื่อแล้ว")}>นำออก</button>
                    : <button className="btn ghost sm" disabled={busy}
                        onClick={() => act("exam_center_register", r.user_id, r.full_name, "เพิ่ม {name} เข้ารายชื่อแล้ว")}>เพิ่มเข้าสอบ</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ marginTop: 6 }}>
        เจ้าหน้าที่ศูนย์เพิ่มหรือนำนักศึกษาออกได้แม้ปิดรับสมัครแล้ว ส่วนนักศึกษาจะสมัครเองได้ถึงกำหนดปิดรับเท่านั้น
      </p>
    </section>
  );
}
