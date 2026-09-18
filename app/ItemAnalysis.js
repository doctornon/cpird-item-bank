"use client";
// ตารางวิเคราะห์รายข้อ แยกออกจาก ScoreAnalytics เพื่อให้แต่ละไฟล์ทำหน้าที่เดียว
// ค่าทั้งหมดคำนวณในฐานข้อมูล ที่นี่ทำหน้าที่แสดงผลและเรียกคำนวณใหม่เท่านั้น
import { Fragment } from "react";
import { classifyItem, reliabilityLabel, verdictClass, verdictLabel } from "../lib/itemStats.mjs";

const num = (v) => (v == null || v === "" ? null : Number(v));
const dec = (v, d = 2) => (v == null ? "—" : Number(v).toFixed(d));
const asPct = (v) => (v == null ? "—" : Math.round(Number(v) * 100) + "%");

function Summary({ summary }) {
  if (!summary) return null;
  const rel = reliabilityLabel(summary.kr20);
  return (
    <div className="stat-strip">
      <div className="stat-cell"><span>ผู้สอบ</span><b>{summary.attempts}</b></div>
      <div className="stat-cell"><span>จำนวนข้อ</span><b>{summary.items}</b></div>
      <div className="stat-cell"><span>คะแนนเฉลี่ย</span><b>{dec(summary.mean, 1)}</b></div>
      <div className="stat-cell"><span>ส่วนเบี่ยงเบน</span><b>{dec(summary.sd, 1)}</b></div>
      <div className="stat-cell stat-cell-wide">
        <span>ความเชื่อมั่นทั้งฉบับ (KR-20)</span>
        <b>{dec(summary.kr20)} <span className={"pill " + rel.cls}>{rel.label}</span></b>
      </div>
    </div>
  );
}

function Distractors({ stat }) {
  const options = stat?.distractors?.options;
  if (!Array.isArray(options) || !options.length) return <p className="muted">ไม่มีข้อมูลตัวเลือก</p>;
  const omitted = num(stat.distractors.omitted) || 0;
  return (
    <div className="distractor-list">
      {options.map((o) => {
        const pct = num(o.pct) ?? 0;
        return (
          <div key={o.label} className={"distractor" + (o.correct ? " is-key" : "") + (!o.correct && Number(o.n) === 0 ? " is-dead" : "")}>
            <span className="distractor-label">{o.label}{o.correct ? " ✓" : ""}</span>
            <span className="distractor-bar"><i style={{ width: Math.max(pct, 0) + "%" }} /></span>
            <span className="distractor-n">{o.n} คน · {pct}%</span>
          </div>
        );
      })}
      {omitted > 0 && (
        <div className="distractor is-omit">
          <span className="distractor-label">ไม่ตอบ</span>
          <span className="distractor-bar" />
          <span className="distractor-n">{omitted} คน</span>
        </div>
      )}
    </div>
  );
}

export default function ItemAnalysis({ facility, deep, computing, canFlag, openItem, onToggle, onCompute, onReview }) {
  const stats = deep?.items || [];
  const byId = new Map(stats.map((s) => [String(s.item_id), s]));
  const hasDeep = stats.length > 0;

  return (
    <section className="item-analysis">
      <div className="workspace-heading" style={{ alignItems: "baseline" }}>
        <div>
          <h3 className="delivery-subheading" style={{ margin: 0 }}>วิเคราะห์รายข้อ</h3>
          <p className="muted" style={{ margin: "2px 0 0" }}>
            {hasDeep
              ? "p = ค่าความยาก · D = อำนาจจำแนกกลุ่มสูง-ต่ำ 27% · r = สหสัมพันธ์กับคะแนนรวม"
              : "ยังไม่เคยคำนวณสถิติของรอบสอบนี้ กดปุ่มเพื่อคำนวณจากคำตอบที่ส่งแล้ว"}
          </p>
        </div>
        <button className="btn" style={{ marginLeft: "auto" }} disabled={computing} onClick={onCompute}>
          {computing ? "กำลังคำนวณ…" : hasDeep ? "↻ คำนวณใหม่" : "คำนวณสถิติ"}
        </button>
      </div>

      <Summary summary={deep?.summary} />

      {facility == null ? <p className="muted">กำลังโหลด…</p> : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>#ข้อ</th><th>โจทย์</th><th>ผู้สอบ</th>
                <th title="ค่าความยาก — สัดส่วนผู้ตอบถูก">p</th>
                <th title="อำนาจจำแนก — กลุ่มสูง 27% ลบกลุ่มต่ำ 27%">D</th>
                <th title="สหสัมพันธ์กับคะแนนรวมที่หักข้อนี้ออกแล้ว">r</th>
                <th>สรุป</th><th></th>
              </tr>
            </thead>
            <tbody>
              {facility.length === 0 ? <tr><td colSpan={8}><div className="empty">ไม่มีข้อมูล</div></td></tr> :
                facility.map((it) => {
                  const st = byId.get(String(it.item_id));
                  const c = st ? classifyItem(st) : null;
                  const f = num(it.facility);
                  const open = openItem === String(it.item_id);
                  return (
                    <Fragment key={it.item_id}>
                      <tr className={open ? "row-open" : undefined}>
                        <td>#{it.item_id}</td>
                        <td style={{ maxWidth: 380 }}>{(it.stem || "").slice(0, 140)}</td>
                        <td>{st?.n ?? it.n_answered}</td>
                        <td>{st ? dec(st.p_value) : f == null ? "—" : (f / 100).toFixed(2)}</td>
                        <td>{st ? dec(st.discrimination) : "—"}</td>
                        <td>{st ? dec(st.point_biserial) : "—"}</td>
                        <td>
                          {c
                            ? <span className={"pill " + verdictClass[c.verdict]}>{verdictLabel[c.verdict]}{c.tentative ? " *" : ""}</span>
                            : <span className="muted">ยังไม่คำนวณ</span>}
                        </td>
                        <td>
                          {st && (
                            <button className="btn ghost sm" aria-expanded={open} onClick={() => onToggle(String(it.item_id))}>
                              {open ? "ซ่อน" : "ดูตัวลวง"}
                            </button>
                          )}
                        </td>
                      </tr>
                      {open && st && (
                        <tr className="row-detail">
                          <td colSpan={8}>
                            <div className="item-detail-grid">
                              <Distractors stat={st} />
                              <div>
                                {c.flags.length === 0
                                  ? <p className="muted" style={{ margin: 0 }}>ไม่พบข้อสังเกต</p>
                                  : <ul className="flag-list">
                                      {c.flags.map((fl) => (
                                        <li key={fl.code} className={"flag flag-" + fl.severity}>
                                          {fl.label} <span className="muted">({fl.detail})</span>
                                        </li>
                                      ))}
                                    </ul>}
                                {c.tentative && <p className="muted" style={{ marginTop: 6 }}>* ผู้สอบยังน้อย ({st.n} คน) ค่าอำนาจจำแนกยังสรุปไม่ได้</p>}
                                {canFlag && st.status !== "review" && c.verdict !== "keep" && (
                                  <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => onReview(st.item_id)}>
                                    ส่งข้อนี้กลับไปทบทวน
                                  </button>
                                )}
                                {st.status === "review" && <p className="muted" style={{ marginTop: 8 }}>อยู่ในคิวทบทวนแล้ว</p>}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ marginTop: 6 }}>
        เกณฑ์: p ที่เหมาะสม 0.30–0.85 · D และ r ควรตั้งแต่ 0.20 ขึ้นไป · ค่าติดลบมักแปลว่าคีย์เฉลยผิด
      </p>
    </section>
  );
}
