"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
const fmt = (s) => s ? new Date(s).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" }) : "—";

export default function Certificates({ sb, notify }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aid, setAid] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb.rpc("exam_attempt_rows", {});
    if (error) { notify("โหลดผลสอบไม่สำเร็จ: " + error.message); setLoading(false); return; }
    setRows(data || []); setLoading(false);
  }, [sb, notify]);
  useEffect(() => { load(); }, [load]);

  const rounds = useMemo(() => {
    const m = new Map();
    for (const r of rows) if (!m.has(r.assignment_id)) m.set(r.assignment_id, { id: r.assignment_id, title: r.assignment_title || r.set_name || "รอบสอบ", pass_mark: r.pass_mark });
    return [...m.values()];
  }, [rows]);
  const round = rounds.find((r) => String(r.id) === String(aid));
  const passed = useMemo(() => {
    if (!aid) return [];
    const rs = rows.filter((r) => String(r.assignment_id) === String(aid) && r.passed && r.percent != null);
    const byU = new Map();
    for (const r of rs) { const cur = byU.get(r.student_uid); if (!cur || Number(r.percent) > Number(cur.percent)) byU.set(r.student_uid, r); }
    return [...byU.values()].sort((a, b) => (a.student_name || "").localeCompare(b.student_name || "", "th"));
  }, [rows, aid]);

  if (loading) return <p className="muted" role="status">กำลังโหลด…</p>;
  return (
    <div>
      <div className="workspace-heading"><div><h2>ประกาศนียบัตร</h2><p>ออกใบประกาศให้ผู้สอบที่ผ่านเกณฑ์ในแต่ละรอบสอบ — เลือกรอบสอบแล้วสั่งพิมพ์ (ใช้คะแนนครั้งที่ดีที่สุดของแต่ละคน)</p></div></div>
      <div className="bank-search sa-noprint" style={{ alignItems: "end", gap: 12, flexWrap: "wrap" }}>
        <div className="search-field" style={{ flex: 1, minWidth: 260 }}><label htmlFor="cert-round">รอบสอบ</label>
          <select id="cert-round" value={aid} onChange={(e) => setAid(e.target.value)}><option value="">— เลือกรอบสอบ —</option>{rounds.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</select></div>
        {aid && passed.length > 0 && <button className="btn" onClick={() => window.print()}>🖨 พิมพ์ใบประกาศทั้งหมด ({passed.length})</button>}
      </div>
      {!aid ? <p className="muted sa-noprint" style={{ marginTop: 12 }}>เลือกรอบสอบเพื่อดูรายชื่อผู้ผ่านเกณฑ์และพิมพ์ใบประกาศ</p> :
        passed.length === 0 ? <p className="empty sa-noprint">ยังไม่มีผู้สอบที่ผ่านเกณฑ์ในรอบนี้</p> : <>
          <p className="set-note sa-noprint" style={{ marginTop: 8 }}>ผ่านเกณฑ์ {passed.length} คน · เกณฑ์ผ่าน {round?.pass_mark}%</p>
          <div className="tablewrap sa-noprint"><table>
            <thead><tr><th>ผู้สอบ</th><th>รหัส</th><th>ศูนย์</th><th>คะแนน</th><th>%</th><th>วันที่สอบ</th></tr></thead>
            <tbody>{passed.map((p) => <tr key={p.attempt_id}><td>{p.student_name || "—"}</td><td>{p.student_code || "—"}</td><td>{p.center_name || "—"}</td><td>{p.score}/{p.max_score}</td><td>{p.percent != null ? Math.round(p.percent) : "—"}%</td><td style={{ whiteSpace: "nowrap" }}>{fmt(p.submitted_at)}</td></tr>)}</tbody>
          </table></div>
          <div className="cert-print">{passed.map((p) => (
            <div key={p.attempt_id} className="cert-page">
              <img src="/cpird-logo.png" alt="" className="cert-logo" onError={(e) => { e.currentTarget.style.display = "none"; }} />
              <div className="cert-kicker">ใบประกาศนียบัตร</div>
              <p className="cert-sub">ขอมอบใบประกาศนียบัตรฉบับนี้เพื่อแสดงว่า</p>
              <div className="cert-name">{p.student_name || "—"}{p.student_code ? ` (${p.student_code})` : ""}</div>
              <p className="cert-sub">ได้ผ่านการทดสอบ</p>
              <div className="cert-exam">{round?.title}</div>
              <p className="cert-score">คะแนน {p.score}/{p.max_score} · {p.percent != null ? Math.round(p.percent) : "—"}% (ผ่านเกณฑ์ {round?.pass_mark}%){p.center_name ? ` · ศูนย์แพทย์ ${p.center_name}` : ""}</p>
              <p className="cert-date">ณ วันที่ {fmt(p.submitted_at)}</p>
              <div className="cert-org">คลังข้อสอบ CPIRD · สำนักงานบริหารโครงการร่วมผลิตแพทย์เพิ่มเพื่อชาวชนบท (สพพ.)</div>
            </div>
          ))}</div>
        </>}
    </div>
  );
}
